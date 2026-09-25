import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

export const WorldIdParamSchema = z.object({ worldId: z.string().uuid() });

export const CertificateSchema = registry.register(
  "Certificate",
  z.object({
    worldId: z.uuid().openapi({ example: "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b" }),
    worldTitle: LocalizedTextSchema.nullable().openapi({
      description: "Null only if the world was somehow deleted after issuance - never expected in practice.",
    }),
    code: z.string().openapi({
      example: "FL-MW-2026-000001",
      description: "FL-<2-letter world code>-<year>-<6-digit sequence>, unique, never reused.",
    }),
    xpEarned: z.number().int().nonnegative().openapi({
      example: 1250,
      description: "The learner's total lifetime XP at the moment of issuance - a snapshot, never recomputed later.",
    }),
    accuracyPct: z.number().int().min(0).max(100).openapi({
      example: 88,
      description: "The passing Boss Quiz attempt's own accuracy.",
    }),
    issuedAt: z.string().datetime().openapi({ example: "2026-04-17T12:00:00.000Z" }),
  }),
);

export const CertificateListResponseSchema = registry.register(
  "CertificateListResponse",
  z.object({ data: z.array(CertificateSchema) }),
);

export const CertificateResponseSchema = registry.register(
  "CertificateResponse",
  z.object({ data: CertificateSchema }),
);

export const CertificatePdfResponseSchema = registry.register(
  "CertificatePdfResponse",
  z.object({
    data: z.object({
      url: z.string().url().openapi({
        description: "Short-lived signed URL to the certificate PDF - the app downloads/shares this directly.",
        example: "https://xxx.supabase.co/storage/v1/s3/finlamma/certificates/...",
      }),
    }),
  }),
);
