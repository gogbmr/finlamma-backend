import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { NewsBookmarkResponseSchema } from "@/server/news/schemas";
import { bookmarkNewsStory, unbookmarkNewsStory } from "@/server/news/service";

const NewsStoryParamsSchema = z.object({ id: z.uuid().describe("The news story's id") });

registry.registerPath({
  method: "post",
  path: "/api/v1/news/{id}/bookmark",
  summary: "Bookmark a news story (app ask A8)",
  description: "Idempotent - bookmarking an already-bookmarked story is a no-op, never a second row.",
  tags: ["News"],
  security: [{ bearerAuth: [] }],
  request: { params: NewsStoryParamsSchema },
  responses: {
    200: {
      description: "The story is now bookmarked",
      content: { "application/json": { schema: NewsBookmarkResponseSchema } },
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

registry.registerPath({
  method: "delete",
  path: "/api/v1/news/{id}/bookmark",
  summary: "Remove a news story bookmark (app ask A8)",
  description: "Idempotent - removing a bookmark that doesn't exist is a no-op, never an error.",
  tags: ["News"],
  security: [{ bearerAuth: [] }],
  request: { params: NewsStoryParamsSchema },
  responses: {
    200: {
      description: "The story is no longer bookmarked",
      content: { "application/json": { schema: NewsBookmarkResponseSchema } },
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

export const POST = withErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const parsedParams = NewsStoryParamsSchema.safeParse(await params);
  if (!parsedParams.success) throw new AppError("VALIDATION_FAILED", "Invalid news story id");

  return ok(await bookmarkNewsStory(user, parsedParams.data.id));
});

export const DELETE = withErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  await requireFullAccess(user);

  const parsedParams = NewsStoryParamsSchema.safeParse(await params);
  if (!parsedParams.success) throw new AppError("VALIDATION_FAILED", "Invalid news story id");

  return ok(await unbookmarkNewsStory(user, parsedParams.data.id));
});
