import { z } from "zod";

// Same "no draft state, just require every language filled" gate as
// rank-titles - a topic is reference data, not content requiring review.
const NonBlankLocalizedTextSchema = z.object({
  en: z.string().min(1, "English name is required"),
  hi: z.string().min(1, "Hindi name is required"),
  hx: z.string().min(1, "Hinglish name is required"),
});

export const TopicInputSchema = z.object({
  order: z.number().int().positive(),
  name: NonBlankLocalizedTextSchema,
  active: z.boolean(),
});
export type TopicInput = z.infer<typeof TopicInputSchema>;
