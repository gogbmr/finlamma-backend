#!/usr/bin/env node
// Generates a human-readable API reference (Markdown) from an OpenAPI 3.x JSON file.
// Usage: node scripts/openapi-to-markdown.mjs openapi/openapi.json docs/API_ENDPOINTS.md
// No dependencies. Do not edit the output by hand — regenerate it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const [, , input = "openapi/openapi.json", output = "docs/API_ENDPOINTS.md"] = process.argv;
const spec = JSON.parse(readFileSync(input, "utf8"));
const METHODS = ["get", "post", "put", "patch", "delete"];

const resolve = (obj, seen = new Set()) => {
  if (!obj || typeof obj !== "object" || !obj.$ref) return obj;
  if (seen.has(obj.$ref)) return {};
  seen.add(obj.$ref);
  const target = obj.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], spec);
  return resolve(target ?? {}, seen);
};

// Build an example value from a schema when no explicit example is provided.
const sample = (schemaIn, depth = 0) => {
  const s = resolve(schemaIn);
  if (!s || depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (s.examples?.length) return s.examples[0];
  if (s.default !== undefined) return s.default;
  if (s.enum) return s.enum[0];
  if (s.const !== undefined) return s.const;
  for (const k of ["oneOf", "anyOf"]) if (s[k]) return sample(s[k].find((x) => resolve(x).type !== "null") ?? s[k][0], depth + 1);
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x) => sample(x, depth + 1)));
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  switch (type) {
    case "object": {
      const out = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = sample(v, depth + 1);
      return out;
    }
    case "array": return [sample(s.items, depth + 1)];
    case "integer": return 0;
    case "number": return 0;
    case "boolean": return true;
    case "string":
      if (s.format === "date-time") return "2026-01-01T00:00:00.000Z";
      if (s.format === "date") return "2026-01-01";
      if (s.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      if (s.format === "uri" || s.format === "url") return "https://example.com";
      return "string";
    default: return null;
  }
};

// Flat field table: name, type, required, description.
const fields = (schemaIn, prefix = "", depth = 0, rows = []) => {
  const s = resolve(schemaIn);
  if (!s || depth > 4) return rows;
  const props = s.properties ?? (s.allOf ? Object.assign({}, ...s.allOf.map((x) => resolve(x).properties ?? {})) : {});
  const req = new Set(s.required ?? []);
  for (const [k, v0] of Object.entries(props)) {
    const v = resolve(v0);
    let t = Array.isArray(v.type) ? v.type.join(" or ") : v.type ?? (v.oneOf || v.anyOf ? "one of several" : "object");
    if (v.enum) t += ` (${v.enum.join(", ")})`;
    if (t === "array") t = `array<${resolve(v.items)?.type ?? "object"}>`;
    rows.push(`| \`${prefix}${k}\` | ${t} | ${req.has(k) ? "yes" : "no"} | ${(v.description ?? "").replace(/\n/g, " ")} |`);
    if (v.type === "object") fields(v, `${prefix}${k}.`, depth + 1, rows);
    if (v.type === "array" && resolve(v.items)?.type === "object") fields(v.items, `${prefix}${k}[].`, depth + 1, rows);
  }
  return rows;
};

const json = (v) => "```json\n" + JSON.stringify(v, null, 2) + "\n```";
const content = (c) => c?.["application/json"] ?? Object.values(c ?? {})[0];
const exampleOf = (media) => {
  if (!media) return null;
  if (media.example !== undefined) return media.example;
  const ex = media.examples && Object.values(media.examples)[0];
  if (ex) return resolve(ex).value;
  return sample(media.schema);
};

const lines = [];
const title = spec.info?.title ?? "API";
lines.push(`# ${title} — Endpoint Reference`, "");
lines.push(`> Generated from \`${input}\` (version ${spec.info?.version ?? "?"}) on ${new Date().toISOString().slice(0, 10)}.`);
lines.push("> Do not edit by hand. Regenerate with the contract script.", "");
if (spec.info?.description) lines.push(spec.info.description, "");

const ops = [];
for (const [p, item] of Object.entries(spec.paths ?? {}))
  for (const m of METHODS) if (item[m]) ops.push({ path: p, method: m, op: item[m], shared: item.parameters ?? [] });

const byTag = new Map();
for (const o of ops) {
  const tag = o.op.tags?.[0] ?? "Other";
  if (!byTag.has(tag)) byTag.set(tag, []);
  byTag.get(tag).push(o);
}

lines.push("## Contents", "");
for (const [tag, list] of byTag) {
  lines.push(`**${tag}**`, "");
  for (const o of list) lines.push(`- \`${o.method.toUpperCase()} ${o.path}\`${o.op.summary ? ` — ${o.op.summary}` : ""}`);
  lines.push("");
}

for (const [tag, list] of byTag) {
  lines.push(`## ${tag}`, "");
  for (const { path: p, method, op, shared } of list) {
    lines.push(`### \`${method.toUpperCase()} ${p}\``, "");
    if (op.summary) lines.push(`**${op.summary}**`, "");
    if (op.description) lines.push(op.description, "");
    const sec = op.security ?? spec.security ?? [];
    lines.push(`**Auth:** ${sec.length ? sec.map((s) => Object.keys(s).join(" + ")).join(" or ") || "none" : "none"}`, "");
    if (op.deprecated) lines.push("⚠️ **Deprecated**", "");

    const params = [...shared, ...(op.parameters ?? [])].map(resolve);
    if (params.length) {
      lines.push("**Parameters**", "", "| Name | In | Type | Required | Description |", "|---|---|---|---|---|");
      for (const pr of params) {
        const sch = resolve(pr.schema) ?? {};
        lines.push(`| \`${pr.name}\` | ${pr.in} | ${sch.type ?? ""}${sch.enum ? ` (${sch.enum.join(", ")})` : ""} | ${pr.required ? "yes" : "no"} | ${(pr.description ?? "").replace(/\n/g, " ")} |`);
      }
      lines.push("");
    }

    const body = resolve(op.requestBody);
    if (body) {
      const media = content(body.content);
      lines.push(`**Request body**${body.required ? " (required)" : ""}`, "");
      const rows = fields(media?.schema);
      if (rows.length) lines.push("| Field | Type | Required | Description |", "|---|---|---|---|", ...rows, "");
      lines.push(json(exampleOf(media)), "");
    }

    lines.push("**Responses**", "");
    for (const [code, r0] of Object.entries(op.responses ?? {})) {
      const r = resolve(r0);
      lines.push(`- **${code}** — ${r.description ?? ""}`);
      const media = content(r.content);
      if (media) lines.push("", json(exampleOf(media)), "");
    }
    lines.push("", "---", "");
  }
}

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, lines.join("\n"));
console.log(`Wrote ${output} (${ops.length} endpoints)`);
