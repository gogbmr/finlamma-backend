import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { okWithDisclaimer, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { FundDetailResponseSchema } from "@/server/funds/schemas";
import { getPublicFund } from "@/server/funds/service";
import { requireFullAccess } from "@/server/onboarding/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/trade/funds/{id}",
  summary: "Get one fund's detail with its latest NAV (TR-39)",
  description: "Fund fundamentals and the latest ingested NAV, plus the trading disclaimer.",
  tags: ["Trade"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: "The fund's detail",
      content: { "application/json": { schema: FundDetailResponseSchema } },
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
      description: "No active fund with this id",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No fund with this id" } },
        },
      },
    },
  },
});

export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    await requireFullAccess(user);
    const { id } = await params;
    const result = await getPublicFund(id);
    return okWithDisclaimer(result.data, result.disclaimer);
  },
);
