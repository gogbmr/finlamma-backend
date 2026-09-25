import { z } from "zod";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireRelaySecret } from "@/lib/relay-auth";
import { RelayConfigResponseSchema } from "@/server/relay/schemas";
import { getRelayConfig } from "@/server/relay/service";

// Relay-only - never called by the app or the admin dashboard. Registered
// (not excluded from the OpenAPI registry) so docs/API_ENDPOINTS.md still
// documents the whole backend per CLAUDE.md, but kept unambiguously marked
// as internal via the "Relay" tag and this description, the same pattern
// already established for the Clerk/RevenueCat webhooks (no bearerAuth/
// clerkSession security scheme - a distinct, non-Clerk auth mechanism
// documented in prose and in the request header schema below, not a
// formal OpenAPI securitySchemes entry, since none of the standard types
// fit a raw shared-secret header well).
registry.registerPath({
  method: "get",
  path: "/api/v1/relay/config",
  summary: "Get the market relay's config (market relay only, X-Relay-Secret)",
  description:
    "Called only by finlamma-market-relay (a separate repo, docs/ARCHITECTURE.md) - never the " +
    "mobile app or the admin dashboard. Authenticated by an X-Relay-Secret header, compared " +
    "against RELAY_SHARED_SECRET in constant time (src/lib/relay-auth.ts), never a Clerk " +
    "session. Returns which instruments to track, the Ops console's feed mode and halt state, " +
    "and the NSE holiday calendar, so the relay knows what to poll/stream and when to skip it. " +
    "See docs/ARCHITECTURE.md D40 for the full Redis price-key contract this endpoint feeds into.",
  tags: ["Relay"],
  request: {
    headers: z.object({
      "X-Relay-Secret": z.string().openapi({ description: "Shared secret, compared in constant time." }),
    }),
  },
  responses: {
    200: {
      description: "The relay's current config",
      content: { "application/json": { schema: RelayConfigResponseSchema } },
    },
    401: {
      description: "Missing or incorrect X-Relay-Secret - no further detail is ever given",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Unauthorized" } },
        },
      },
    },
    429: {
      description: "Too many requests",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        },
      },
    },
    503: {
      description: "RELAY_SHARED_SECRET is not configured on this deployment",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "SERVICE_UNAVAILABLE", message: "Relay authentication is not configured" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  await requireRelaySecret(req);
  return ok(await getRelayConfig());
});
