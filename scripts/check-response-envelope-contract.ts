// Guards against the exact bug fixed in this batch: a route's registered
// OpenAPI response schema says one thing (wrapped in { data: ... }, or
// flat) while the handler actually returns the other at runtime. That
// mismatch is invisible to every other check (typecheck passes, `pnpm
// contract` "succeeds", docs/API_ENDPOINTS.md looks fine) because nothing
// previously compared the DOCUMENTED shape against the ACTUAL return
// statement - see docs/STATUS.md's 2026-11-11 entry (GET/PATCH
// /me/notification-prefs, plus 17 further endpoints, all had this exact
// mismatch: schema registered flat, handler called ok()/created() which
// wraps in { data } at runtime).
//
// Same spirit as scripts/check-promise-all-db-concurrency.ts and
// scripts/generate-openapi.test.ts: a conservative, convention-based
// plain-text scan, not a type-aware analysis. It trusts the committed
// openapi/openapi.json to be current (the same trust every other contract
// check in this codebase already places on it - keeping it current is
// `pnpm contract`'s job, not this script's). It only covers src/app/api/v1
// (the mobile app's contract) - webhooks and /api/track aren't app-read
// response bodies, so they're out of scope here.
//
// Classification is by which response-sending call appears in a handler's
// return statement: ok()/okList()/okWithDisclaimer()/created() (src/lib/
// http.ts) always wrap in { data: ... } (+ nextCursor/disclaimer for the
// list/disclaimer variants) at runtime; a bare NextResponse.json(x) does
// not. If a handler uses some other pattern entirely, this reports it as
// UNKNOWN rather than guessing - that needs a human look, not a silent
// pass.
//
// Suppress a specific false positive with a same-line or line-above
// comment: // response-envelope-contract-ok: <reason>
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API_V1_DIR = path.join(process.cwd(), "src", "app", "api", "v1");
const OPENAPI_PATH = path.join(process.cwd(), "openapi", "openapi.json");
const SUPPRESSION_RE = /response-envelope-contract-ok:/;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type Finding = {
  file: string;
  method: string;
  path: string;
  reason: string;
};

// Same bracket-matching helper as check-promise-all-db-concurrency.ts -
// finds the index of the bracket matching text[openIndex], skipping over
// string/template contents and nested brackets.
function findMatchingBracket(text: string, openIndex: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const open = text[openIndex];
  const close = pairs[open];
  if (!close) return -1;

  let depth = 0;
  let inString: string | null = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) found.push(...findRouteFiles(full));
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

// Every { method, path } pair this file registers via registry.registerPath.
function extractRegisteredPaths(text: string): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  const callRe = /registry\.registerPath\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(text))) {
    const openBraceIndex = text.indexOf("{", m.index);
    const closeBraceIndex = findMatchingBracket(text, openBraceIndex);
    if (closeBraceIndex === -1) continue;
    const block = text.slice(openBraceIndex, closeBraceIndex + 1);
    const methodMatch = block.match(/method:\s*"(\w+)"/);
    const pathMatch = block.match(/path:\s*"([^"]+)"/);
    if (methodMatch && pathMatch) {
      out.push({ method: methodMatch[1].toUpperCase(), path: pathMatch[1] });
    }
  }
  return out;
}

type Classification = "WRAPPED" | "FLAT" | "UNKNOWN";

// The text of one exported HTTP method handler - from `export const
// <METHOD> =` to the next `export const ` (or end of file). This codebase's
// convention is one handler per export, never two for the same method in
// one file, so this slice never crosses into another handler.
function extractHandlerBlocks(text: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const exportRe = new RegExp(`export const (${METHODS.join("|")}) = `, "g");
  const matches: { method: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = exportRe.exec(text))) {
    matches.push({ method: m[1], index: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    blocks.set(matches[i].method, text.slice(start, end));
  }
  return blocks;
}

function classifyHandler(block: string): Classification {
  const wrapped = /return\s+(ok|okList|okWithDisclaimer|created)\s*\(/.test(block);
  const flat = /return\s+NextResponse\.json\s*\(/.test(block);
  if (wrapped && !flat) return "WRAPPED";
  if (flat && !wrapped) return "FLAT";
  return "UNKNOWN"; // neither, or both (mixed early returns) - needs a human look
}

// method+path -> whether openapi.json's resolved 2xx JSON response schema
// has a top-level "data" property. Mirrors the resolve/sample logic in
// scripts/openapi-to-markdown.mjs (kept independent on purpose - this is a
// contract check, not a renderer, and shouldn't share failure modes with
// the doc generator it's meant to catch gaps in).
type JsonRecord = Record<string, unknown>;

function buildHasDataMap(): Map<string, boolean> {
  const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as JsonRecord;
  const map = new Map<string, boolean>();

  function resolve(obj: unknown, seen = new Set<string>()): JsonRecord {
    if (!obj || typeof obj !== "object" || !("$ref" in obj)) return (obj as JsonRecord) ?? {};
    const ref = (obj as { $ref: string }).$ref;
    if (seen.has(ref)) return {};
    seen.add(ref);
    const target = ref
      .replace(/^#\//, "")
      .split("/")
      .reduce<unknown>((o, k) => (o as JsonRecord | undefined)?.[k], spec);
    return resolve(target ?? {}, seen);
  }

  for (const [p, item] of Object.entries(spec.paths ?? {}) as [string, JsonRecord][]) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = item[method] as JsonRecord | undefined;
      if (!op) continue;
      for (const code of ["200", "201"]) {
        const responses = op.responses as JsonRecord | undefined;
        const r = resolve(responses?.[code]);
        const content = r.content as JsonRecord | undefined;
        const media = content?.["application/json"] as JsonRecord | undefined;
        if (!media) continue;
        const schema = resolve(media.schema);
        if (!schema || (schema.type !== "object" && !schema.properties)) continue;
        const hasData = Object.prototype.hasOwnProperty.call(
          (schema.properties as JsonRecord | undefined) ?? {},
          "data",
        );
        map.set(`${method.toUpperCase()} ${p}`, hasData);
      }
    }
  }
  return map;
}

function isSuppressed(fileText: string, method: string): boolean {
  const block = extractHandlerBlocks(fileText).get(method) ?? "";
  return SUPPRESSION_RE.test(block);
}

export function findEnvelopeContractFindings(): Finding[] {
  const findings: Finding[] = [];
  const hasDataMap = buildHasDataMap();
  const files = findRouteFiles(API_V1_DIR);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const registered = extractRegisteredPaths(text);
    if (registered.length === 0) continue;
    const handlerBlocks = extractHandlerBlocks(text);
    const relFile = path.relative(process.cwd(), file);

    for (const { method, path: p } of registered) {
      const hasData = hasDataMap.get(`${method} ${p}`);
      if (hasData === undefined) continue; // no 2xx JSON response registered for this op - nothing to check

      const block = handlerBlocks.get(method);
      if (block === undefined) continue; // registered but no matching exported handler found - generate-openapi.test.ts's job to catch, not this one's

      if (isSuppressed(text, method)) continue;

      const classification = classifyHandler(block);
      if (classification === "UNKNOWN") {
        findings.push({
          file: relFile,
          method,
          path: p,
          reason:
            "could not classify the handler's response as wrapped (ok/okList/okWithDisclaimer/created) " +
            "or flat (NextResponse.json) - uses some other pattern, or mixes both across early returns",
        });
      } else if (hasData && classification === "FLAT") {
        findings.push({
          file: relFile,
          method,
          path: p,
          reason: "documented response has a top-level data property, but the handler returns NextResponse.json(...) directly (flat)",
        });
      } else if (!hasData && classification === "WRAPPED") {
        findings.push({
          file: relFile,
          method,
          path: p,
          reason: "documented response is flat, but the handler wraps it in { data: ... } at runtime",
        });
      }
    }
  }

  return findings;
}

if (require.main === module) {
  const findings = findEnvelopeContractFindings();
  if (findings.length === 0) {
    console.log("OK: every src/app/api/v1 route's documented response envelope matches its handler.");
  } else {
    console.error(`Found ${findings.length} response-envelope mismatch(es):\n`);
    for (const f of findings) {
      console.error(`  ${f.method} ${f.path} (${f.file}) - ${f.reason}`);
    }
    process.exit(1);
  }
}
