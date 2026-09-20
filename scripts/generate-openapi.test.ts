// Guards against the exact gap Phase 2b Checkpoint 2 hit: a new
// src/app/api/v1/**/route.ts file that registers an OpenAPI path but never
// gets imported into generate-openapi.ts, so it silently never reaches
// openapi.json / docs/API_ENDPOINTS.md even though pnpm contract "succeeds".
// Fails loudly, naming the missing file(s), instead of relying on someone
// remembering to add the import - see the new-endpoint skill's step 2.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_V1_DIR = path.join(process.cwd(), "src", "app", "api", "v1");
const GENERATOR_PATH = path.join(process.cwd(), "scripts", "generate-openapi.ts");

function findRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      found.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

// Mirrors generate-openapi.ts's own import style, e.g.
// `import "../src/app/api/v1/mentors/route";` - a route file's expected
// import specifier is its path relative to src/, prefixed with "../src/",
// extension stripped, forward slashes only (matches on Windows too, since
// path.join above produces backslashes there).
function expectedImportSpecifier(routeFile: string): string {
  const relativeToSrc = path
    .relative(path.join(process.cwd(), "src"), routeFile)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  return `../src/${relativeToSrc}`;
}

describe("every src/app/api/v1 route file is imported by scripts/generate-openapi.ts", () => {
  it("has no route.ts file missing from the generator's import list", () => {
    const routeFiles = findRouteFiles(API_V1_DIR);
    expect(routeFiles.length).toBeGreaterThan(0); // sanity check the scan itself isn't broken

    const generatorSource = readFileSync(GENERATOR_PATH, "utf8");
    const missing = routeFiles
      .map((file) => ({ file, importSpecifier: expectedImportSpecifier(file) }))
      .filter(({ importSpecifier }) => !generatorSource.includes(importSpecifier))
      .map(({ file }) => path.relative(process.cwd(), file));

    expect(missing).toEqual([]);
  });
});
