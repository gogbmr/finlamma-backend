#!/usr/bin/env node
// PreToolUse hook (matcher: Edit|MultiEdit|Write). Protects secrets, lockfiles,
// generated files and already-created database migrations from direct edits.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = input.tool_input?.file_path ?? "";
if (!file) process.exit(0);

const rel = path.relative(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), file).replace(/\\/g, "/");
const base = path.basename(rel);

const block = (why) => {
  process.stderr.write(`Blocked by project hook: ${why} (${rel}).`);
  process.exit(2);
};

if (/^\.env(\.(local|development|production|test))?$/.test(base))
  block("Secret env files are edited by the user only. Update .env.example instead and tell the user which variable to add");
if (["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].includes(base))
  block("Lockfiles change only through the package manager");
if (/^drizzle\/\d{4}_.+\.sql$/.test(rel) && existsSync(file))
  block("Existing migrations are immutable. Change src/db/schema and run `pnpm db:generate` to create a new migration");
if (/^drizzle\/meta\//.test(rel)) block("Drizzle meta files are generated");
if (/^src\/api-client\/schema\.d\.ts$/.test(rel) || /^openapi\/openapi\.json$/.test(rel))
  block("Generated API contract files. Regenerate them with the contract script instead");
if (rel === "docs/API_ENDPOINTS.md" && existsSync(path.join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), "scripts/openapi-to-markdown.mjs")))
  block("docs/API_ENDPOINTS.md is generated from the OpenAPI contract. Change the Zod schemas/route registration (server) or run `pnpm api:sync` (app)");

process.exit(0);
