import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { MyEntitlementsResponseSchema } from "@/server/monetisation/schemas";
import { getMyMonetisationStatus } from "@/server/monetisation/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/entitlements",
  summary: "Get my entitlements and ad/subscription eligibility",
  description:
    "Returns the caller's current entitlements (e.g. ad_free), whether ads should show right " +
    "now (World 3 cleared and not ad-free), whether ad requests must be tagged non-" +
    "personalized/child-directed (docs/ARCHITECTURE.md D66 - under-18 or unknown age, fails " +
    "closed to the strict treatment), and whether the subscribe purchase path may be offered " +
    "at all (D67 - false for a known-or-unknown-age minor; a parent must subscribe from their " +
    "own device/account, never the child's).",
  tags: ["Monetisation"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's entitlements and ad/subscription eligibility",
      content: { "application/json": { schema: MyEntitlementsResponseSchema } },
    },
    401: {
      description: "Not signed in",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Sign-in required" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return ok(await getMyMonetisationStatus(user));
});
