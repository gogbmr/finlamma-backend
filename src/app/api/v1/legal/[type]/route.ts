import { z } from "zod";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { LegalDocumentResponseSchema, LegalDocumentTypeSchema } from "@/server/legal/schemas";
import { getPublicDocument } from "@/server/legal/service";

registry.registerPath({
  method: "get",
  path: "/api/v1/legal/{type}",
  summary: "Get a published legal document",
  description:
    "Public - no authentication required, since a user needs to be able to read the Terms " +
    "before signing up. Returns the currently published version of the Terms, Privacy or " +
    "Risk-disclosure document.",
  tags: ["Legal"],
  request: {
    params: z.object({ type: LegalDocumentTypeSchema }),
  },
  responses: {
    200: {
      description: "The currently published document",
      content: { "application/json": { schema: LegalDocumentResponseSchema } },
    },
    404: {
      description: "No published version of this document type yet",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "NOT_FOUND", message: "No published terms document yet" } },
        },
      },
    },
  },
});

export const GET = withErrors(
  async (_req: Request, { params }: { params: Promise<{ type: string }> }) => {
    const { type } = await params;
    const parsed = LegalDocumentTypeSchema.safeParse(type);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", "Unknown legal document type");
    }
    return ok(await getPublicDocument(parsed.data));
  },
);
