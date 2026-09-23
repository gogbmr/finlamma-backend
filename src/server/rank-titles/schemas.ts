import { z } from "zod";

// Admin CRUD input - all three languages required (unlike mentors/worlds,
// this table has no draft state to hold an incomplete row in, so the gate
// is just "every field non-blank", not a separate publish-time check).
const NonBlankLocalizedTextSchema = z.object({
  en: z.string().min(1, "English title is required"),
  hi: z.string().min(1, "Hindi title is required"),
  hx: z.string().min(1, "Hinglish title is required"),
});

export const RankTitleInputSchema = z.object({
  minLevel: z.number().int().positive(),
  title: NonBlankLocalizedTextSchema,
});
export type RankTitleInput = z.infer<typeof RankTitleInputSchema>;
