#!/usr/bin/env node
// PostToolUse hook (matcher: Edit|MultiEdit|Write). Formats and lint-fixes the edited file.
// Never blocks: formatting problems are reported, not fatal.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = input.tool_input?.file_path ?? "";
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!file || !existsSync(file)) process.exit(0);

const bin = (name) => {
  const p = path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
  return existsSync(p) ? p : null;
};
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });

if (/\.(ts|tsx|js|jsx|mjs|cjs|json|md|css)$/.test(file) && bin("prettier")) {
  run(bin("prettier"), ["--write", "--log-level", "warn", file]);
}
if (/\.(ts|tsx|js|jsx)$/.test(file) && bin("eslint")) {
  const r = run(bin("eslint"), ["--fix", "--quiet", file]);
  if (r.status && r.stdout) {
    // Exit 0 with stderr would be hidden; print to stdout so it shows in the transcript.
    console.log(`ESLint issues remain in ${path.relative(root, file)}:\n${r.stdout.slice(0, 3000)}`);
  }
}
process.exit(0);
