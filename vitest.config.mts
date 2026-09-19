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
    exclude: [...configDefaults.exclude, "**/.kilo/**"],
  },
});
