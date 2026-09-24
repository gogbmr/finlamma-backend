import { requireUser } from "@/lib/auth";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { getMyReportCard } from "@/server/report-card/service";
import { ReportCardResponseSchema } from "@/server/report-card/schemas";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/report-card",
  summary: "My weekly report card (PR-30/31/32/33)",
  description:
    "The current IST week's efficiency snapshot (null until the first Monday after signup has " +
    "run), an 8-week efficiency-score trend, and whether it's currently shared with a verified " +
    "parent (docs/ARCHITECTURE.md D33). Coach notes are progress-only and never comparative.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "The caller's report card",
      content: { "application/json": { schema: ReportCardResponseSchema } },
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
  return ok(await getMyReportCard(user));
});
