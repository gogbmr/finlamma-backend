import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { okWithDisclaimer, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { InstrumentDetailResponseSchema } from "@/server/market/schemas";
import { getPublicInstrumentBySymbol } from "@/server/market/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/instruments/{symbol}",
  summary: "Get one instrument's detail with a live quote (TR-15/17/19/20)",
  description:
    "Instrument fundamentals (sector, about, tip, market cap, P/E), a live quote, and the " +
    "trading disclaimer. `about`/`tip` are admin-curated, educational-only copy - never a buy/" +
    "sell signal (CLAUDE.md, docs/ROADMAP.md's pre-launch legal-review checklist item).",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ symbol: z.string().openapi({ example: "RELIANCE" }) }) },
  responses: {
    200: {
      description: "The instrument's detail",
      content: { "application/json": { schema: InstrumentDetailResponseSchema } },
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

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ symbol: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { symbol } = await params;
    const result = await getPublicInstrumentBySymbol(symbol.toUpperCase());
    return okWithDisclaimer(result.data, result.disclaimer);
  },
);
