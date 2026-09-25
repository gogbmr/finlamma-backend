// Soft, non-blocking guardrail for instruments.about/tip (PRODUCT_SPEC.md:
// "Educational only - never investment advice"). Pure keyword heuristic, not
// a hard validation rule - natural educational writing can legitimately use
// words like "buy" ("a bank's loan book determines whether it can keep
// lending..."), so this only ever WARNS a staff member before they save,
// never blocks the save. It cannot catch every advice-like phrasing and
// isn't meant to - it's a second pair of eyes at the point of authoring,
// same spirit as D34's tone-rule help text for coach notes, not a
// substitute for the pre-launch legal review of this copy
// (docs/ROADMAP.md's pre-launch checklist).
const ADVICE_LIKE_PHRASES = [
  "buy now",
  "sell now",
  "strong buy",
  "must buy",
  "sure shot",
  "guaranteed return",
  "guaranteed profit",
  "will rise",
  "will fall",
  "will grow",
  "will increase",
  "will decrease",
  "expect growth",
  "expected to grow",
  "target price",
  "price target",
  "hot stock",
  "best stock",
  "invest now",
  "don't miss",
  "can't miss",
  "definitely grow",
  "safe bet",
  "best investment",
] as const;

// Case-insensitive substring match against the flat list above. Returns the
// exact matched phrases (not positions) so the caller can show which words
// triggered the warning.
export function findAdviceLikePhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return ADVICE_LIKE_PHRASES.filter((phrase) => lower.includes(phrase));
}
