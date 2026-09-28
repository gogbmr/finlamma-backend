import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, parseLimit, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { NewsCategorySchema, NewsFeedResponseSchema } from "@/server/news/schemas";
import { getNewsFeed } from "@/server/news/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/news/feed",
  summary: "Get the published news feed (NW-01..07)",
  description:
    "Published stories only, newest first, cursor-paginated. Each row includes whether the " +
    "caller has already read it (news_reads). Optionally filtered to one category.",
  tags: ["News"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      limit: z.string().optional().describe("Page size, default 20").openapi({ example: "20" }),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous page's nextCursor"),
      category: z
        .string()
        .optional()
        .describe("Filter to one news_category value")
        .openapi({ example: "rbi_rates" }),
    }),
  },
  responses: {
    200: {
      description: "A page of the published news feed",
      content: { "application/json": { schema: NewsFeedResponseSchema } },
    },
    400: {
      description: "Invalid limit, cursor or category",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Invalid category" } },
        },
      },
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

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const rawCategory = searchParams.get("category");
  let category = null;
  if (rawCategory) {
    const parsed = NewsCategorySchema.safeParse(rawCategory);
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid category");
    category = parsed.data;
  }

  const result = await getNewsFeed(user.id, { limit, cursor: searchParams.get("cursor"), category });
  return ok(result);
});
