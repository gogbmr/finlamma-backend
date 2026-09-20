import { z } from "zod";
import { legalDocumentTypeEnum } from "@/db/schema";
import { registry } from "@/lib/openapi";

export const LegalDocumentTypeSchema = z.enum(legalDocumentTypeEnum.enumValues).openapi({
  example: "terms",
  description: "terms, privacy or risk_disclosure.",
});

export const LegalDocumentContentSchema = z.object({
  en: z.string(),
  hi: z.string(),
  hx: z.string(),
});
export type LegalDocumentContent = z.infer<typeof LegalDocumentContentSchema>;

export const LegalDocumentDataSchema = registry.register(
  "LegalDocument",
  z.object({
    type: LegalDocumentTypeSchema,
    version: z.number().int().openapi({ example: 1 }),
    content: LegalDocumentContentSchema.openapi({
      example: {
        en: "[DRAFT PLACEHOLDER - pending legal review] Terms of use...",
        hi: "[DRAFT PLACEHOLDER - pending legal review] उपयोग की शर्तें...",
        hx: "[DRAFT PLACEHOLDER - pending legal review] Terms of use...",
      },
    }),
    publishedAt: z
      .string()
      .datetime()
      .nullable()
      .openapi({ example: "2026-01-01T00:00:00.000Z" }),
    isPlaceholder: z.boolean().openapi({
      example: true,
      description:
        "True if this is pre-legal-review filler text seeded by scripts/seed-legal-documents.ts, " +
        "not real legal text a staff member published.",
    }),
  }),
);

export const LegalDocumentResponseSchema = registry.register(
  "LegalDocumentResponse",
  z.object({ data: LegalDocumentDataSchema }),
);

const LegalStatusItemSchema = z.object({
  type: LegalDocumentTypeSchema,
  currentVersion: z.number().int().openapi({ example: 1 }),
  accepted: z.boolean().openapi({
    description: "Whether the signed-in user has accepted the currently published version themselves.",
  }),
  acceptedAt: z.string().datetime().nullable(),
});

export const LegalStatusDataSchema = registry.register(
  "LegalStatus",
  z.object({
    documents: z.array(LegalStatusItemSchema),
    allAccepted: z.boolean().openapi({
      description: "True once every currently published document has been self-accepted.",
    }),
  }),
);

export const LegalStatusResponseSchema = registry.register(
  "LegalStatusResponse",
  z.object({ data: LegalStatusDataSchema }),
);

export const AcceptLegalResponseSchema = registry.register(
  "AcceptLegalResponse",
  z.object({ data: z.object({ accepted: z.array(LegalDocumentTypeSchema) }) }),
);

// Plain Zod (no OpenAPI registration): these back the admin Legal document
// editor's Server Actions, not /api/v1 routes - same convention as
// src/server/staff/schemas.ts.
export const SaveLegalDraftSchema = z.object({
  type: LegalDocumentTypeSchema,
  content: LegalDocumentContentSchema,
});
export type SaveLegalDraftInput = z.infer<typeof SaveLegalDraftSchema>;

export const PublishLegalDocumentSchema = z.object({
  type: LegalDocumentTypeSchema,
});
export type PublishLegalDocumentInput = z.infer<typeof PublishLegalDocumentSchema>;
