import { requireUser } from "@/lib/auth";
import { okWithDisclaimer, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { FundListResponseSchema } from "@/server/funds/schemas";
import { listPublicFunds } from "@/server/funds/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/funds",
  summary: "List active mutual funds with their latest NAV (Explore mode, TR-35/38)",
  description:
    "Every fund shown here is a fictional Finlamma-branded wrapper over a real AMFI scheme, " +
    "tracked internally for realistic NAV movement (docs/ARCHITECTURE.md D45) - the real " +
    "scheme code is never included in this or any other response. `latestNav` is null if this " +
    "fund has never been ingested yet.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Active funds with their latest NAV",
      content: { "application/json": { schema: FundListResponseSchema } },
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
    403: {
      description: "Onboarding, parental consent or legal acceptance is incomplete",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "FORBIDDEN", message: "Complete onboarding before using this feature" },
          },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  await requireFullAccess(user);
  const result = await listPublicFunds();
  return okWithDisclaimer(result.data, result.disclaimer);
});
