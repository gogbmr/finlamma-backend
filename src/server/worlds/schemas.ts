import { z } from "zod";
import { registry } from "@/lib/openapi";
import { LocalizedTextSchema } from "@/server/shared/schemas";
import { MentorKeySchema } from "@/server/mentors/schemas";

export const WorldPublicSchema = registry.register(
  "World",
  z.object({
    order: z.number().int().openapi({ example: 1 }),
    title: LocalizedTextSchema.openapi({
      example: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
    }),
    tagline: LocalizedTextSchema.openapi({
      example: {
        en: "From barter to UPI — the whole story of money",
        hi: "बार्टर से UPI तक — पैसे की पूरी कहानी",
        hx: "Barter se UPI tak — paise ki poori kahani",
      },
    }),
    theme: z.string().openapi({
      example: "#7C3AED",
      description: "Cosmetic accent color/key for the world card - never affects unlock logic.",
    }),
    displayXpTarget: z.number().int().openapi({
      example: 5,
      description:
        "Cosmetic progress indicator only, shown on a locked world's card - never the actual " +
        "unlock gate. The real rule is sequential (clearing the previous world's Boss Quiz).",
    }),
    artUrl: z.string().url().nullable().openapi({
      description: "Short-lived signed URL to the world's art, or null if none uploaded yet.",
    }),
    mentorKey: MentorKeySchema.openapi({
      description: "The mentor covering this world (see GET /api/v1/mentors for their details).",
    }),
  }),
);

export const WorldListResponseSchema = registry.register(
  "WorldListResponse",
  z.object({ data: z.array(WorldPublicSchema) }),
);

// --- Staff (admin) - plain Zod, not OpenAPI-registered (admin mutations are
// Server Actions per docs/ARCHITECTURE.md D16, same convention as
// src/server/mentors/schemas.ts) ---

export const CreateWorldDraftSchema = z.object({
  order: z.number().int().positive(),
  title: LocalizedTextSchema,
  tagline: LocalizedTextSchema,
  theme: z.string().min(1),
  displayXpTarget: z.number().int().nonnegative(),
  mentorId: z.string().uuid(),
});
export type CreateWorldDraftInput = z.infer<typeof CreateWorldDraftSchema>;

export const UpdateWorldDraftSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().positive(),
  title: LocalizedTextSchema,
  tagline: LocalizedTextSchema,
  theme: z.string().min(1),
  displayXpTarget: z.number().int().nonnegative(),
  mentorId: z.string().uuid(),
});
export type UpdateWorldDraftInput = z.infer<typeof UpdateWorldDraftSchema>;

export const WorldIdSchema = z.object({ id: z.string().uuid() });
export type WorldIdInput = z.infer<typeof WorldIdSchema>;
