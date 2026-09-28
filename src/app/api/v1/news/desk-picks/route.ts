import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { NewsDeskPicksResponseSchema } from "@/server/news/schemas";
import { getNewsDeskPicksForApp } from "@/server/news/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/news/desk-picks",
  summary: "Get the currently active News Desk picks (NW-05, NW-46)",
  description:
    "Staff-curated highlight cards (Desk Pick / Exam Alert / Scam Watch), shown separately " +
    "from the algorithmic feed. Entirely staff-authored - never touched by the AI ingestion " +
    "pipeline.",
  tags: ["News"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Active desk picks",
      content: { "application/json": { schema: NewsDeskPicksResponseSchema } },
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
  return ok(await getNewsDeskPicksForApp());
});
