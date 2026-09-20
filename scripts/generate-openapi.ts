// Builds openapi/openapi.json from the OpenAPI registry. Run via `pnpm contract`
// (also regenerates docs/API_ENDPOINTS.md). Do not hand-edit the output.
import "../envConfig";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "../src/lib/openapi";

// Import every route file that registers a path as a side effect. Add one
// import per resource as new routes get built.
import "../src/app/api/v1/health/route";
import "../src/app/api/v1/me/route";
import "../src/app/api/v1/legal/[type]/route";
import "../src/app/api/v1/me/legal-status/route";
import "../src/app/api/v1/me/legal/accept/route";
import "../src/app/api/v1/me/date-of-birth/route";
import "../src/app/api/v1/me/parent-consent/request/route";
import "../src/app/api/v1/me/legal/reapproval/resend/route";
import "../src/app/api/webhooks/clerk/route";
import "../src/app/api/webhooks/clerk-staff/route";

const generator = new OpenApiGeneratorV31(registry.definitions);

const document = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Finlamma API",
    version: "0.1.0",
    description:
      "REST API for the Finlamma mobile app (/api/v1) and the internal admin/relay endpoints.",
  },
});

const outPath = path.join(process.cwd(), "openapi", "openapi.json");
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(document, null, 2) + "\n");
console.log(`Wrote ${outPath} (${Object.keys(document.paths ?? {}).length} paths)`);
