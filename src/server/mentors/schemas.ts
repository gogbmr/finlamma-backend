import { z } from "zod";
import { registry } from "@/lib/openapi";

// Leaf-level trilingual text - see docs/DATA_MODEL.md's Learning section and
// docs/ARCHITECTURE.md's Phase 2b kickoff discussion for why this is one
// shared structure with localized leaves, not three duplicated content
// trees or a separate translations-table key.
export const LocalizedTextSchema = z.object({
  en: z.string(),
  hi: z.string(),
  hx: z.string(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const MentorKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase letters, digits and underscores only")
  .openapi({ example: "baby", description: "Stable slug identifying this mentor." });

export const MentorPublicSchema = registry.register(
  "Mentor",
  z.object({
    key: MentorKeySchema,
    order: z.number().int().openapi({ example: 1 }),
    name: LocalizedTextSchema.openapi({
      example: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
    }),
    bio: LocalizedTextSchema.openapi({
      example: {
        en: "The very first mentor - asks lots of questions, never judges.",
        hi: "पहला मेंटर - बहुत सवाल पूछता है, कभी जज नहीं करता।",
        hx: "Sabse pehla mentor - dher saara sawaal poochta hai, kabhi judge nahi karta.",
      },
    }),
    worldRangeStart: z.number().int().openapi({ example: 1 }),
    worldRangeEnd: z.number().int().nullable().openapi({
      example: 3,
      description: "Null means an open-ended range (e.g. \"World 7+\").",
    }),
    artUrl: z.string().url().nullable().openapi({
      description: "Short-lived signed URL to the mentor's art, or null if none uploaded yet.",
    }),
  }),
);

export const MentorResponseSchema = registry.register(
  "MentorResponse",
  z.object({ data: MentorPublicSchema }),
);
export const MentorListResponseSchema = registry.register(
  "MentorListResponse",
  z.object({ data: z.array(MentorPublicSchema) }),
);

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16, same convention as
// src/server/legal/schemas.ts) ---

export const CreateMentorDraftSchema = z.object({
  key: MentorKeySchema,
  order: z.number().int().positive(),
  name: LocalizedTextSchema,
  bio: LocalizedTextSchema,
  worldRangeStart: z.number().int().positive(),
  worldRangeEnd: z.number().int().positive().nullable(),
});
export type CreateMentorDraftInput = z.infer<typeof CreateMentorDraftSchema>;

export const UpdateMentorDraftSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().positive(),
  name: LocalizedTextSchema,
  bio: LocalizedTextSchema,
  worldRangeStart: z.number().int().positive(),
  worldRangeEnd: z.number().int().positive().nullable(),
});
export type UpdateMentorDraftInput = z.infer<typeof UpdateMentorDraftSchema>;

export const MentorIdSchema = z.object({ id: z.string().uuid() });
export type MentorIdInput = z.infer<typeof MentorIdSchema>;
