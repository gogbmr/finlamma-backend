#!/usr/bin/env node
// Stop hook. If TypeScript files changed, run the typecheck before Claude finishes.
// On errors, exit 2 so Claude keeps working and fixes them (once; stop_hook_active prevents loops).
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!existsSync(path.join(root, "node_modules"))) process.exit(0);

const shell = process.platform === "win32";
const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", shell });
if (status.status !== 0 || !/\.(ts|tsx)\s*$/m.test(status.stdout)) process.exit(0);

const tc = spawnSync("pnpm", ["-s", "typecheck"], { cwd: root, encoding: "utf8", shell });
if (tc.status !== 0) {
  process.stderr.write(
    "TypeScript errors found. Fix them before finishing:\n" + ((tc.stdout || "") + (tc.stderr || "")).slice(0, 6000)
  );
  process.exit(2);
}
process.exit(0);
