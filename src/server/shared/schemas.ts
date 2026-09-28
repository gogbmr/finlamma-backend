import { z } from "zod";

// India's 28 states + 8 union territories - a fixed, closed list (not free
// text) since this value is used as an Arena leaderboard scope-bucketing key
// (docs/PRODUCT_SPEC.md §3, FEATURE_MAP AR-07): free text would fragment the
// state-scope pool (e.g. "Delhi" vs "New Delhi" vs "delhi") and could carry
// arbitrary content into a column nothing ever displays back to the learner
// who typed it, but that Arena's grouping logic does trust.
export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

export const IndianStateSchema = z.enum(INDIAN_STATES);
export type IndianState = (typeof INDIAN_STATES)[number];

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

const LANGUAGES = ["en", "hi", "hx"] as const;

function isLocalizedTextShaped(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    LANGUAGES.every((lang) => typeof (value as Record<string, unknown>)[lang] === "string")
  );
}

// Recursively walks an arbitrary value (a lesson's `content` jsonb, a
// mentor's flat {name, bio}, anything) and collects the dotted/bracketed
// path of every {en,hi,hx}-shaped leaf where at least one language is
// missing or blank - e.g. "content.scenes[0].title.hi". Mentors/worlds have
// flat, hand-enumerable fields so their own validateXForPublish checks each
// by name directly; lesson content is arbitrarily nested (a variable number
// of scenes/pages/etc.), so this generic walker is what makes the same
// "name every missing field" publish gate possible there too - see
// src/server/lessons/service.ts's validateLessonForPublish.
export function findMissingLocalizedText(value: unknown, path = ""): string[] {
  if (isLocalizedTextShaped(value)) {
    return LANGUAGES.filter((lang) => !String(value[lang]).trim()).map((lang) =>
      path ? `${path}.${lang}` : lang,
    );
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findMissingLocalizedText(item, `${path}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, v]) =>
      findMissingLocalizedText(v, path ? `${path}.${key}` : key),
    );
  }
  return [];
}
