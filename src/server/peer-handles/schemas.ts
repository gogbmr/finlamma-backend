import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - must run
// before any .openapi() call in this file (see src/lib/openapi.ts).
import "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";

// D73 (docs/ARCHITECTURE.md): the handle the learner currently has, shown
// to other learners everywhere a name used to appear. Full LocalizedText,
// same "client picks the language" convention badges/chips/rankTitle
// already use. Nullable only for the brief window before account-creation
// auto-assign or the backfill has run - every account should have one in
// steady state.
export const PeerHandleSchema = LocalizedTextSchema.nullable().openapi({
  example: { en: "Smart Saver", hi: "समझदार बचतकर्ता", hx: "Smart Saver" },
  description:
    "The learner's current peer-visible handle - staff-curated, never learner-authored " +
    "(D73, docs/ARCHITECTURE.md). Replaces the old firstName+lastInitial display name " +
    "everywhere another learner can see it.",
});

export const RerollMyHandleResponseSchema = z.object({
  data: z.object({
    handle: LocalizedTextSchema.openapi({
      example: { en: "Bright Bull", hi: "तेज़ बैल", hx: "Bright Bull" },
    }),
    nextRerollAvailableAt: z.iso.datetime().openapi({
      example: "2026-11-11T00:00:00.000Z",
      description: "30 days from now - the earliest the next reroll will be allowed.",
    }),
  }),
});

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16) ---

// All three languages required - same "no draft state to hold an
// incomplete row in" reasoning as about_me_chips/rank_titles.
const NonBlankLocalizedTextSchema = z.object({
  en: z.string().min(1, "English name is required"),
  hi: z.string().min(1, "Hindi name is required"),
  hx: z.string().min(1, "Hinglish name is required"),
});

export const PeerHandleInputSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .regex(/^[a-z0-9-]+$/, "Key must be lowercase letters, numbers and hyphens only"),
  name: NonBlankLocalizedTextSchema,
  active: z.boolean(),
});
export type PeerHandleInput = z.infer<typeof PeerHandleInputSchema>;

// key is immutable after creation (same "structural fields stay fixed on
// edit" convention every other admin content type's update schema follows).
export const PeerHandleUpdateInputSchema = z.object({
  name: NonBlankLocalizedTextSchema,
  active: z.boolean(),
});
export type PeerHandleUpdateInput = z.infer<typeof PeerHandleUpdateInputSchema>;
