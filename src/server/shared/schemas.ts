import { z } from "zod";

// Leaf-level trilingual text - see src/db/schema/_helpers.ts's LocalizedText
// (the same shape at the db layer) and docs/DATA_MODEL.md's Learning
// section for why this is one shared structure with localized leaves, not
// three duplicated content trees or a separate translations-table key.
// Shared across every admin-editable content domain (mentors, worlds,
// lessons, questions, ...) rather than redeclared per domain.
export const LocalizedTextSchema = z.object({
  en: z.string(),
  hi: z.string(),
  hx: z.string(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
