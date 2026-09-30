import { z } from "zod";
import { DEFAULT_USER_PREFERENCES, languageEnum, themeEnum } from "@/db/schema";
import { registry } from "@/lib/openapi";
import { IndianStateSchema } from "@/server/shared/schemas";

const LanguageSchema = z.enum(languageEnum.enumValues).openapi({
  example: "en",
  description: "en (English), hi (Hindi) or hx (Hinglish).",
});
const ThemeSchema = z.enum(themeEnum.enumValues).openapi({ example: "dark" });

// SET-08/09/10: sound/haptics/data-saver toggles, one small jsonb blob per
// docs/DATA_MODEL.md rather than three narrow columns.
const PreferencesSchema = z
  .object({
    sound: z.boolean().openapi({ example: true, description: "In-app sound effects on/off." }),
    haptics: z.boolean().openapi({ example: true, description: "Haptic feedback on/off." }),
    dataSaver: z.boolean().openapi({
      example: false,
      description: "Serves lower-resolution lesson videos when on.",
    }),
    cheersEnabled: z.boolean().openapi({
      example: true,
      description:
        "Off hides this learner's cheer button from every other learner's Arena view - no " +
        "cheers can be sent to them while off. Never affects cheers they've already received.",
    }),
  })
  .openapi({ example: DEFAULT_USER_PREFERENCES });

// docs/ARCHITECTURE.md D36 (settled, not aspirational): this field is NEVER
// rendered to any other learner, in this endpoint or any future one -
// including Arena's public player profile (Phase 6, FEATURE_MAP AR-20),
// which shows a set of admin-curated preset chips instead of this free text.
// Free text a minor writes, shown to other minors, with no moderation
// pipeline, is a child-safety risk (contact details, school names, a
// grooming vector) this app does not take on. If a future feature ever
// needs to surface something learner-authored to other learners, it must be
// a new, separately-reviewed field/mechanism - never this one.
const BIO_MAX_LENGTH = 280;
const BioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, `Bio must be ${BIO_MAX_LENGTH} characters or fewer`)
  .nullable()
  .openapi({
    example: "Saving up for my first SIP!",
    description: "Free-text, self-editable, private to the owner - never shown to any other learner.",
  });

// Optional (docs/PRODUCT_SPEC.md §3, decided): used only to place the
// learner in Arena's state-scope leaderboard. Never returned by, or
// readable from, any endpoint another learner can see - not even Arena's
// public player profile.
const StateSchema = IndianStateSchema.nullable().openapi({
  example: "Maharashtra",
  description:
    "Optional. Used only to place you in Arena's state-scope leaderboard - never shown on " +
    "your or anyone else's public profile.",
});

export const MeDataSchema = registry.register(
  "Me",
  z.object({
    id: z.uuid().openapi({ example: "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b" }),
    firstName: z.string().nullable().openapi({
      example: "Chirag",
      description: "Kid-safe display name part - never the full last name.",
    }),
    lastInitial: z.string().length(1).nullable().openapi({ example: "B" }),
    email: z.string().nullable().openapi({ example: "chirag@example.com" }),
    phone: z.string().nullable().openapi({ example: "+919876543210" }),
    language: LanguageSchema,
    theme: ThemeSchema,
    bio: BioSchema,
    state: StateSchema,
    preferences: PreferencesSchema,
  }),
);

export const MeResponseSchema = registry.register(
  "MeResponse",
  z.object({ data: MeDataSchema }),
);

// language/theme/bio/preferences - the fields our DB owns outright. Name,
// email and phone are Clerk-owned identity fields: they're changed through
// Clerk's own UI on the mobile app and flow in automatically via the
// existing user.updated webhook, so there's no second write path to keep in
// sync. `preferences` is always sent whole (not deep-merged) - the app
// already holds the full current object from GET /me before it ever shows a
// toggle to change one field of it, so a partial-merge endpoint would only
// add complexity for a case the client never actually has.
export const UpdateMeRequestSchema = registry.register(
  "UpdateMeRequest",
  z
    .object({
      language: LanguageSchema.optional(),
      theme: ThemeSchema.optional(),
      bio: BioSchema.optional(),
      state: StateSchema.optional(),
      preferences: PreferencesSchema.optional(),
    })
    .refine(
      (v) =>
        v.language !== undefined ||
        v.theme !== undefined ||
        v.bio !== undefined ||
        v.state !== undefined ||
        v.preferences !== undefined,
      { message: "Provide at least one of language, theme, bio, state or preferences" },
    ),
);

export type UpdateMeInput = z.infer<typeof UpdateMeRequestSchema>;

export const DeleteMeResponseSchema = registry.register(
  "DeleteMeResponse",
  z.object({ data: z.object({ deleted: z.literal(true) }) }),
);
