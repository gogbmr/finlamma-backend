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

// The STAFF Clerk app's own session cookie (clerkMiddleware()/auth(), see
// docs/ARCHITECTURE.md D2a) - every admin-facing /api/v1 route gated by
// getStaffMember()/requireStaff() uses this, never bearerAuth. Most admin
// mutations are Server Actions (D16) rather than REST, so this is
// documented here for the handful of /api/v1 routes that are staff-gated
// REST endpoints (e.g. GET /api/v1/health/details).
registry.registerComponent("securitySchemes", "clerkSession", {
  type: "apiKey",
  in: "cookie",
  name: "__session",
  description: "The signed-in staff member's Clerk session cookie - never a bearer token.",
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
