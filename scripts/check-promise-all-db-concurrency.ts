// Scans src/ for Promise.all/Promise.allSettled calls whose array elements
// are likely to issue more concurrent Postgres queries than src/db/client.ts's
// pool `max` can give separate connections to - the exact trigger for
// docs/ARCHITECTURE.md decisions D13/D72 (an extra query beyond `max` gets
// pipelined onto an already-busy logical connection, which Supabase's
// transaction-mode pooler can silently reassign mid-stream, wedging it
// forever - see D72's full account for why neither idle_timeout nor
// max_lifetime can ever reclaim it). See scripts/check-promise-all-db-
// concurrency.test.ts, which runs this as a pnpm test guard, and the
// db-concurrency skill for how to fix a real finding (src/lib/
// concurrency-limit.ts's runWithConcurrencyLimit).
//
// This is NOT a type-aware analysis (no TypeScript compiler/checker) - it's
// a conservative, convention-based heuristic, in the same spirit as
// scripts/generate-openapi.test.ts's plain-text route-file scan: deliberately
// simple over deliberately precise, because precise would mean a real
// cross-file call-graph analyzer, and this codebase's own convention (every
// DB access goes through a server/*/repo.ts or server/*/service.ts function,
// confirmed by reading dozens of these this investigation) makes a
// convention-based heuristic reliable enough in practice. It WILL
// over-flag sometimes (a service.ts call that happens to do exactly one
// query, not more) - that's deliberate: a human reviewing a false positive
// and adding a suppression comment is a cheap cost; silently missing a real
// one is the expensive failure this exists to prevent. It can also
// under-flag something this heuristic's assumptions don't cover (e.g. a
// DB call routed through a module that isn't under server/*/repo.ts or
// server/*/service.ts) - it is a safety net, not a guarantee.
//
// Suppress a specific false positive with a same-line or line-above
// comment: // promise-all-db-concurrency-ok: <reason>
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "src");
const DB_CLIENT_PATH = path.join(process.cwd(), "src", "db", "client.ts");
const SUPPRESSION_RE = /promise-all-db-concurrency-ok:/;

export type Finding = {
  file: string;
  line: number;
  snippet: string;
  estimatedConcurrency: number;
  maxAllowed: number;
};

export function readConfiguredMax(): number {
  const source = readFileSync(DB_CLIENT_PATH, "utf8");
  const match = source.match(/\bmax:\s*(\d+)/);
  if (!match) {
    throw new Error(
      `Could not find a "max: <number>" option in ${DB_CLIENT_PATH} - this check needs it.`,
    );
  }
  return Number(match[1]);
}

function findSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      found.push(...findSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

// Index of the character matching `text[openIndex]` (which must be one of
// ( [ {), skipping over string/template-literal contents and nested
// brackets of any kind so a `)` inside a string or a nested call doesn't
// end the scan early. Not a real tokenizer (doesn't handle every JS/TS
// string-escaping edge case) - good enough for this codebase's own
// formatting, same tradeoff as generate-openapi.test.ts's plain-text scan.
function findMatchingBracket(text: string, openIndex: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const open = text[openIndex];
  const close = pairs[open];
  if (!close)
    throw new Error(
      `findMatchingBracket: character at ${openIndex} ("${open}") isn't an opening bracket`,
    );

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
  return -1; // unbalanced - caller treats this file/call as unparseable and skips it
}

// Splits `text` (the inside of an array literal, brackets excluded) into
// its top-level comma-separated elements - commas inside nested brackets
// or strings don't split.
function splitTopLevel(text: string): string[] {
  const elements: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
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
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      elements.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const last = text.slice(start);
  if (last.trim().length > 0) elements.push(last);
  return elements;
}

// Local-name -> module specifier, from every `import ... from "specifier"`
// in the file (named, default and namespace imports all map every local
// name they introduce to the same specifier - precise enough here since we
// only need "does this name come from a server/*/repo.ts or
// server/*/service.ts module", not which exact export).
function parseImports(fileText: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRe = /import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(fileText))) {
    const [, clause, specifier] = m;
    const names = clause
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const asMatch = n.match(/^(?:type\s+)?\S+\s+as\s+(\S+)$/);
        return asMatch ? asMatch[1] : n.replace(/^type\s+/, "");
      });
    for (const name of names) map.set(name, specifier);
  }
  return map;
}

// Resolves an import specifier to an actual source file on disk, from the
// importing file's own location - handles this project's "@/*" -> "src/*"
// alias (tsconfig.json) and plain relative imports. Returns null if nothing
// resolves (a package import like "drizzle-orm", or a path this doesn't
// handle) - callers treat that as "can't tell, don't count it".
function resolveImportFile(specifier: string, fromFile: string): string | null {
  let basePath: string;
  if (specifier.startsWith("@/")) {
    basePath = path.join(SRC_DIR, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = path.join(path.dirname(fromFile), specifier);
  } else {
    return null; // a package import, e.g. "drizzle-orm" - not ours to resolve
  }

  for (const candidate of [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // doesn't exist, try the next candidate
    }
  }
  return null;
}

// Whether a resolved file imports `db` directly from src/db/client - the
// one thing every real Postgres-querying module in this codebase has in
// common, regardless of which directory or naming convention it otherwise
// follows (repo.ts, service.ts, or a lib/ helper like src/lib/settings.ts -
// found as a real gap in an earlier version of this heuristic, which only
// recognized the repo.ts/service.ts naming pattern and missed it).
const directDbFileCache = new Map<string, boolean>();
function touchesDbDirectly(file: string): boolean {
  const cached = directDbFileCache.get(file);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    const text = readFileSync(file, "utf8");
    result = /from\s+["'](@\/db\/client|\.\.?\/.*\/db\/client)["']/.test(text);
  } catch {
    result = false;
  }
  directDbFileCache.set(file, result);
  return result;
}

// Estimated concurrent-query "weight" of one Promise.all array element.
// Conservative by design (see the file header): a call into a file that
// imports `db` directly is exactly one query by this codebase's convention
// of one Drizzle call per repo/lib function; a call into any other file
// under src/server/ is weighted as 2 (at least one, often wraps more - see
// D72's getMentorEditorData, which wrapped 2) rather than resolving further
// and counting precisely.
function classifyImport(specifier: string, fromFile: string): 0 | 1 | 2 {
  const resolved = resolveImportFile(specifier, fromFile);
  if (!resolved) return 0;
  if (touchesDbDirectly(resolved)) return 1;
  if (resolved.includes(`${path.sep}server${path.sep}`)) return 2;
  return 0;
}

function elementWeight(
  element: string,
  imports: Map<string, string>,
  fromFile: string,
): number {
  const trimmed = element.trim();

  if (/\.map\s*\(\s*async\b/.test(trimmed)) {
    return Infinity; // unbounded fan-out - always flag regardless of threshold
  }

  const nestedPromiseAll = trimmed.match(/Promise\.(all|allSettled)\s*\(/);
  if (nestedPromiseAll) {
    const openParenIndex = trimmed.indexOf("(", nestedPromiseAll.index!);
    const closeParenIndex = findMatchingBracket(trimmed, openParenIndex);
    if (closeParenIndex === -1) return 1;
    const inner = trimmed.slice(openParenIndex + 1, closeParenIndex);
    const arrayStart = inner.indexOf("[");
    if (arrayStart === -1) return 1;
    const arrayEnd = findMatchingBracket(inner, arrayStart);
    if (arrayEnd === -1) return 1;
    const innerElements = splitTopLevel(inner.slice(arrayStart + 1, arrayEnd));
    return innerElements.reduce(
      (sum, el) => sum + elementWeight(el, imports, fromFile),
      0,
    );
  }

  const callMatch = trimmed.match(/^(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/);
  if (!callMatch) return 0;
  const specifier = imports.get(callMatch[1]);
  if (!specifier) return 0;
  return classifyImport(specifier, fromFile);
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function isSuppressed(fileText: string, lineNumber: number): boolean {
  const lines = fileText.split("\n");
  const thisLine = lines[lineNumber - 1] ?? "";
  const prevLine = lines[lineNumber - 2] ?? "";
  return SUPPRESSION_RE.test(thisLine) || SUPPRESSION_RE.test(prevLine);
}

export function findConcurrencyFindings(maxAllowed: number): Finding[] {
  const findings: Finding[] = [];
  const files = findSourceFiles(SRC_DIR);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const imports = parseImports(text);
    const callRe = /Promise\.(all|allSettled)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(text))) {
      const openParenIndex = text.indexOf("(", m.index);
      const closeParenIndex = findMatchingBracket(text, openParenIndex);
      if (closeParenIndex === -1) continue;
      const inner = text.slice(openParenIndex + 1, closeParenIndex);
      const arrayStart = inner.indexOf("[");
      if (arrayStart === -1) continue; // Promise.all(someVariable) - not a literal we can inspect
      const arrayEnd = findMatchingBracket(inner, arrayStart);
      if (arrayEnd === -1) continue;

      const elements = splitTopLevel(inner.slice(arrayStart + 1, arrayEnd));
      const weight = elements.reduce(
        (sum, el) => sum + elementWeight(el, imports, file),
        0,
      );

      if (weight > maxAllowed) {
        const line = lineNumberAt(text, m.index);
        if (isSuppressed(text, line)) continue;
        findings.push({
          file: path.relative(process.cwd(), file),
          line,
          snippet: text
            .slice(m.index, Math.min(closeParenIndex + 1, m.index + 160))
            .replace(/\s+/g, " "),
          estimatedConcurrency: weight,
          maxAllowed,
        });
      }
    }
  }

  return findings;
}

if (require.main === module) {
  const max = readConfiguredMax();
  const findings = findConcurrencyFindings(max);
  if (findings.length === 0) {
    console.log(
      `OK: no Promise.all/allSettled exceeds the estimated safe concurrency (max: ${max}).`,
    );
  } else {
    console.error(
      `Found ${findings.length} Promise.all/allSettled call(s) estimated to exceed max: ${max}:\n`,
    );
    for (const f of findings) {
      console.error(
        `  ${f.file}:${f.line} - estimated ${f.estimatedConcurrency} concurrent queries`,
      );
      console.error(`    ${f.snippet}`);
    }
    process.exit(1);
  }
}
