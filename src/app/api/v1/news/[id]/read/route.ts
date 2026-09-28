import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, requestMeta, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { MarkNewsReadRequestSchema, MarkNewsReadResponseSchema } from "@/server/news/schemas";
import { markNewsStoryRead } from "@/server/news/service";

const NewsStoryParamsSchema = z.object({ id: z.uuid().describe("The news story's id") });

registry.registerPath({
  method: "post",
  path: "/api/v1/news/{id}/read",
  summary: "Mark a news story as read (NW-09)",
  description:
    "Server-validated, not client-trusted: the reported dwellSeconds is checked against a real " +
    "minimum computed from the story's own content length (see GET .../{id}'s minReadSeconds), " +
    "and rejected with NEWS_READ_TOO_SOON if it's too low. Idempotent - a repeat call for an " +
    "already-read story returns { read: true, alreadyRead: true }, never a second logged event.",
  tags: ["News"],
  security: [{ bearerAuth: [] }],
  request: {
    params: NewsStoryParamsSchema,
    body: { content: { "application/json": { schema: MarkNewsReadRequestSchema } } },
  },
  responses: {
    200: {
      description: "The read was recorded (or already had been)",
      content: { "application/json": { schema: MarkNewsReadResponseSchema } },
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
    429: {
      description: "The reported dwell time is below this story's minimum read time",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NEWS_READ_TOO_SOON", message: "Keep reading for at least 25 seconds" } },
        },
      },
    },
  },
});

export const POST = withErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const parsedParams = NewsStoryParamsSchema.safeParse(await params);
  if (!parsedParams.success) throw new AppError("VALIDATION_FAILED", "Invalid news story id");

  const { dwellSeconds } = MarkNewsReadRequestSchema.parse(await req.json());
  return ok(await markNewsStoryRead(user, parsedParams.data.id, dwellSeconds, requestMeta(req.headers)));
});
