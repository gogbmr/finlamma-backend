import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { okList, parseLimit, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { WalletHistoryResponseSchema } from "@/server/economy/schemas";
import { getMyWalletHistory } from "@/server/economy/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/wallet/history",
  summary: "Get my V Money ledger history (PR-24)",
  description: "The caller's full earn/spend ledger, newest first, cursor-paginated.",
  tags: ["Learning"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      limit: z.string().optional().openapi({ example: "20" }),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "A page of the caller's ledger history",
      content: { "application/json": { schema: WalletHistoryResponseSchema } },
    },
    400: {
      description: "Invalid limit or cursor",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Invalid cursor" } },
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
  const { data, nextCursor } = await getMyWalletHistory(user.id, { limit, cursor: searchParams.get("cursor") });
  return okList(data, nextCursor);
});
