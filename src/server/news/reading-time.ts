// NW-09: a story is only marked "read" after the learner stays on it for
// its own stated read-duration - computed from actual content length
// rather than one fixed constant for every story, so a two-line story and
// a four-paragraph one aren't held to the same bar. A pure function (no DB/
// settings_kv access) - simple enough not to need admin tuning yet; revisit
// as settings_kv if the founder wants staff control over the reading-speed
// assumption later.
const WORDS_PER_MINUTE = 120; // slower than average adult reading speed, deliberately - this is simplified content for teenage learners, and the point is genuine engagement, not a speed-read
const MIN_READ_SECONDS = 15;
const MAX_READ_SECONDS = 60;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function computeMinReadSeconds(bodyParagraphsEn: string[]): number {
  const totalWords = bodyParagraphsEn.reduce((sum, p) => sum + countWords(p), 0);
  const seconds = Math.round((totalWords / WORDS_PER_MINUTE) * 60);
  return Math.min(MAX_READ_SECONDS, Math.max(MIN_READ_SECONDS, seconds));
}
