import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { okWithDisclaimer, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { CandlesResponseSchema, TimeframeSchema } from "@/server/market/schemas";
import { getInstrumentCandles } from "@/server/market/service";
import { MARKET_TIMEFRAMES, type MarketTimeframe } from "@/server/market/types";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/instruments/{symbol}/candles",
  summary: "Get candlestick history for an instrument (TR-05/16)",
  description: "OHLCV candles for one of the app's fixed chart timeframes (1D/1W/1M/3M/1Y).",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ symbol: z.string().openapi({ example: "RELIANCE" }) }),
    query: z.object({ tf: TimeframeSchema.optional() }),
  },
  responses: {
    200: {
      description: "OHLCV candles, oldest first",
      content: { "application/json": { schema: CandlesResponseSchema } },
    },
    400: {
      description: "Invalid timeframe",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "VALIDATION_FAILED", message: "Invalid tf - must be one of 1D, 1W, 1M, 3M, 1Y" } },
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
    404: {
      description: "No active instrument with this symbol",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No instrument with this symbol" } },
        },
      },
    },
  },
});

function parseTimeframe(raw: string | null): MarketTimeframe {
  if (raw === null) return "1M";
  if ((MARKET_TIMEFRAMES as readonly string[]).includes(raw)) return raw as MarketTimeframe;
  throw new AppError("VALIDATION_FAILED", `Invalid tf - must be one of ${MARKET_TIMEFRAMES.join(", ")}`);
}

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ symbol: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { symbol } = await params;
    const { searchParams } = new URL(req.url);
    const timeframe = parseTimeframe(searchParams.get("tf"));
    const result = await getInstrumentCandles(symbol.toUpperCase(), timeframe);
    return okWithDisclaimer(result.data, result.disclaimer);
  },
);
