import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { okList, parseLimit, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { requireFullAccess } from "@/server/onboarding/service";
import { PortfolioTradesResponseSchema, PortfolioTradesStatusEnum } from "@/server/portfolio/schemas";
import { getPortfolioTrades } from "@/server/portfolio/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/portfolio/trades",
  summary: "Get my trade history, filterable All/Open/Closed (Profile Trades tab, PR-28)",
  description:
    "`open` rows are current holdings (a snapshot, not a log); `closed` rows are past SELL " +
    "fills with their realized P&L. `cursor` only ever pages through CLOSED trades - open " +
    "positions are always returned in full on the first page (no cursor given) and omitted " +
    "from every later page, so they're never duplicated across pages.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: PortfolioTradesStatusEnum.optional().openapi({ example: "all" }),
      limit: z.string().optional().openapi({ example: "20" }),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "A page of the caller's trade history",
      content: { "application/json": { schema: PortfolioTradesResponseSchema } },
    },
    400: {
      description: "Invalid status, limit or cursor",
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
  const statusRaw = searchParams.get("status") ?? "all";
  const status = PortfolioTradesStatusEnum.parse(statusRaw);
  const limit = parseLimit(searchParams.get("limit"));
  const { data, nextCursor } = await getPortfolioTrades(user.id, { status, limit, cursor: searchParams.get("cursor") });
  return okList(data, nextCursor);
});
