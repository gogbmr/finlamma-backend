import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { getMyCompetitionStatus } from "@/server/competitions/service";
import { MyCompetitionStatusResponseSchema } from "@/server/competitions/schemas";

registry.registerPath({
  method: "get",
  path: "/api/v1/arena/competitions/current/me",
  summary: "Get my status in the current Monthly Competition (AR-15)",
  description:
    "The \"You\" rank card - live rank/ROI% among every entrant, computed the instant it's " +
    "requested (never a cached snapshot - a competition is a single ongoing event, not a " +
    "recurring weekly cycle like Arena leagues). `entered: false` if the caller hasn't entered " +
    "yet; `data: null` if there's no active competition at all right now. ROI% is computed " +
    "against the FULL starting capital, never just the deployed cost basis.",
  tags: ["Arena"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's competition status",
      content: { "application/json": { schema: MyCompetitionStatusResponseSchema } },
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
  return ok(await getMyCompetitionStatus(user));
});
