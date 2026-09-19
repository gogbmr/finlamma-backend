import { z } from "zod";
import { languageEnum, themeEnum } from "@/db/schema";
import { registry } from "@/lib/openapi";

const LanguageSchema = z.enum(languageEnum.enumValues).openapi({
  example: "en",
  description: "en (English), hi (Hindi) or hx (Hinglish).",
});
const ThemeSchema = z.enum(themeEnum.enumValues).openapi({ example: "dark" });

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
  }),
);

export const MeResponseSchema = registry.register(
  "MeResponse",
  z.object({ data: MeDataSchema }),
);

// Only language/theme - the fields our DB owns outright. Name, email and
// phone are Clerk-owned identity fields: they're changed through Clerk's
// own UI on the mobile app and flow in automatically via the existing
// user.updated webhook, so there's no second write path to keep in sync.
export const UpdateMeRequestSchema = registry.register(
  "UpdateMeRequest",
  z
    .object({
      language: LanguageSchema.optional(),
      theme: ThemeSchema.optional(),
    })
    .refine((v) => v.language !== undefined || v.theme !== undefined, {
      message: "Provide at least one of language or theme",
    }),
);

export type UpdateMeInput = z.infer<typeof UpdateMeRequestSchema>;

export const DeleteMeResponseSchema = registry.register(
  "DeleteMeResponse",
  z.object({ data: z.object({ deleted: z.literal(true) }) }),
);
