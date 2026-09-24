import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Clerk skill bundle - not our code.
    ".agents/**",
    // Leftover/stray worktrees nested inside the repo (other tools' or
    // earlier sessions' checkouts of another branch) - same reasoning as
    // vitest.config.mts's own exclude for these paths: a checkout sitting
    // here is a second, unrelated copy of the codebase (at a different
    // commit, possibly mid-edit), never this project's own lint surface.
    ".claude/worktrees/**",
    ".kilo/**",
  ]),
]);

export default eslintConfig;
