import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] }), react()],
  test: {
    environment: "node",
    // Belt-and-braces: exclude any stray worktrees or tool state nested
    // inside the repo (e.g. .kilo/) in addition to vitest's own defaults
    // (node_modules, dist, .git, ...), so a leftover checkout there never
    // gets picked up as a second, colliding copy of the test suite.
    exclude: [...configDefaults.exclude, "**/.kilo/**", "**/.claude/worktrees/**"],
    // Capped well below the machine's core count (4) - the growing set of
    // PGlite-backed *.repo.test.ts files (each spins up its own in-process
    // WASM Postgres, src/test/db.ts) was OOM-crashing a worker fork under
    // the full suite's default (uncapped) concurrency, more often as more
    // such files land. Individual files always pass in isolation - this is
    // peak PGlite memory pressure, not a real test failure. maxForks: 1
    // cuts the crash frequency substantially (measured empirically) but has
    // NOT been fully eliminated on this machine even fully serialized - an
    // occasional `pnpm test` run can still OOM partway through; a plain
    // re-run then passes. Don't try `isolate: false` as a further fix - it
    // was tried and caused real cross-file test failures (these PGlite
    // tests rely on file-level module isolation for a fresh DB instance
    // each), not just fewer OOMs.
    // NOTE: top-level `maxForks` (which a Vitest deprecation warning points
    // to) did NOT actually cap concurrency on this project's installed
    // vitest version (5.0.1) at runtime - the OOM crashes still happened
    // with it. `fileParallelism: false` is what actually works here.
    fileParallelism: false,
  },
});
