import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Adds the .openapi() method to Zod schemas. Must run before any schema
// in the app calls .openapi(), so this module has to be imported first
// wherever routes register themselves.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// The mobile app's Bearer token, verified against the CONSUMER Clerk
// application in requireUser() (src/lib/auth.ts) - not the staff/admin
// session, which never touches /api/v1 routes. See docs/ARCHITECTURE.md
// decision D2a.
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Consumer Clerk session token, sent as `Authorization: Bearer <token>`.",
});

// Shared error envelope every route can reference in its responses.
export const ErrorResponseSchema = registry.register(
  "ErrorResponse",
  z.object({
    error: z.object({
      code: z.string().openapi({ example: "NOT_FOUND" }),
      message: z.string().openapi({ example: "Resource not found" }),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
);
