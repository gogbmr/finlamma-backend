import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { NewsStoryDetailResponseSchema } from "@/server/news/schemas";
import { getNewsStoryDetail } from "@/server/news/service";

const NewsStoryParamsSchema = z.object({ id: z.uuid().describe("The news story's id") });

registry.registerPath({
  method: "get",
  path: "/api/v1/news/{id}",
  summary: "Get a published news story's full detail (NW-08)",
  description:
    "Full body, jargon term and the minimum read time (minReadSeconds) the app must report " +
    "to POST .../read for the read to actually count. 404s for a draft/hidden story - it isn't " +
    "learner-visible regardless of whether the caller has the id.",
  tags: ["News"],
  security: [{ bearerAuth: [] }],
  request: { params: NewsStoryParamsSchema },
  responses: {
    200: {
      description: "The story's full detail",
      content: { "application/json": { schema: NewsStoryDetailResponseSchema } },
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
    404: {
      description: "No published news story with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published news story with this id" } },
        },
      },
    },
  },
});

export const GET = withErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const parsed = NewsStoryParamsSchema.safeParse(await params);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid news story id");

  return ok(await getNewsStoryDetail(user.id, parsed.data.id));
});
