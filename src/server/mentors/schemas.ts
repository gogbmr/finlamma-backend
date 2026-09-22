import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// Re-exported so existing imports of `LocalizedText`/`LocalizedTextSchema`
// from this module (e.g. the admin mentor editor) keep working unchanged -
// see src/server/shared/schemas.ts for the actual definition, now shared
// with the worlds domain too.
export { LocalizedTextSchema };
export type { LocalizedText } from "@/server/shared/schemas";

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
  // Voice/tone notes for the Doubt Zone AI chat to stay in character as
  // this mentor - internal, staff-facing only, never returned by the
  // public GET /api/v1/mentors endpoint.
  persona: z.string(),
});
export type CreateMentorDraftInput = z.infer<typeof CreateMentorDraftSchema>;

export const UpdateMentorDraftSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().positive(),
  name: LocalizedTextSchema,
  bio: LocalizedTextSchema,
  persona: z.string(),
});
export type UpdateMentorDraftInput = z.infer<typeof UpdateMentorDraftSchema>;

export const MentorIdSchema = z.object({ id: z.string().uuid() });
export type MentorIdInput = z.infer<typeof MentorIdSchema>;

// D20 (docs/ARCHITECTURE.md): direct edit of an already-PUBLISHED mentor's
// name/bio, without unpublishing - the fix for the circular problem where
// unpublishing a mentor is blocked while a published world references it
// (src/server/mentors/service.ts unpublishMentor). No `persona`/`order`/
// `key` - those are structural, not a typo fix, and still go through the
// normal unpublish -> edit draft -> republish cycle.
export const HotfixMentorSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  bio: LocalizedTextSchema,
});
export type HotfixMentorInput = z.infer<typeof HotfixMentorSchema>;
