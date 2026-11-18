// Pure, framework-free question-content logic for the Task 5a editor
// redesign (question-editor.tsx) - deliberately kept in its own module
// with NO React/next/server-action imports, so it can be unit-tested
// directly (payload-round-trip.test.ts) without pulling in ./actions's
// "use server" chain, which throws on import outside a real request
// (missing env vars like DATABASE_URL via src/db/client.ts) - same reason
// lessons/lesson-content.ts exists.
import { z } from "zod";
import { LocalizedTextSchema } from "@/server/shared/schemas";
import {
  answerSchemaForFormat,
  payloadSchemaForFormat,
  QuestionFormatSchema,
  type QuestionFormat,
} from "@/server/questions/schemas";

export const FORMATS: readonly QuestionFormat[] = QuestionFormatSchema.options;

// ---------------------------------------------------------------------------
// Task 5a: client-side form schema. Unlike lessons' quiz-like content
// (Task 4b/4), NO question format's payload/answer array needs useFieldArray
// wrapping - every array in a payload is already an array of objects
// (LocalizedText), and every array in an answer is a plain number[]
// PARALLEL to one of those payload arrays (never independently added to/
// removed from on its own - its length always follows the payload array
// it maps onto, kept in sync by resizeParallelArray below whenever that
// payload array changes). So payloadSchemaForFormat/answerSchemaForFormat
// are reused completely unmodified here - never a change to schemas.ts.
// ---------------------------------------------------------------------------

const BasicsAndTextSchema = z.object({
  topicId: z.string().uuid().nullable(),
  prompt: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
});

export function buildQuestionFormSchema(format: QuestionFormat) {
  return BasicsAndTextSchema.extend({
    payload: payloadSchemaForFormat(format),
    answer: answerSchemaForFormat(format),
  });
}

// ---------------------------------------------------------------------------
// Keeping an answer's parallel array in sync with the payload array it maps
// onto, whenever the staff adds/removes a payload entry via useFieldArray -
// useFieldArray's own remove(index) can target ANY row, not just the last
// one, so these are index-aware (splice-equivalent), not a truncate/pad-at-
// -the-end resize (which would silently misalign every entry after the one
// removed).
// ---------------------------------------------------------------------------

export function appendParallelEntry<T>(arr: T[], defaultValue: T): T[] {
  return [...arr, defaultValue];
}

export function removeParallelEntry<T>(arr: T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}

// ordering's correctOrder is a PERMUTATION of pool indices, not a 1:1
// parallel mapping by position - removing pool index `removedIndex` must
// drop every reference to it and shift every reference above it down by
// one, to stay a valid permutation of the new (shorter) pool. Appending a
// new pool item is simpler - appendParallelEntry it onto the end of
// correctOrder too (the staff can reorder via the position selects).
export function renumberOrderAfterRemoval(order: number[], removedIndex: number): number[] {
  return order.filter((idx) => idx !== removedIndex).map((idx) => (idx > removedIndex ? idx - 1 : idx));
}

// ---------------------------------------------------------------------------
// Data-loss guard (same reasoning as lessons/lesson-content.ts's
// extractUnknownContentKeys): zodResolver's successful result is the
// PARSED output of a plain z.object() payload/answer schema, which
// silently strips any key the schema doesn't declare. The server's own
// mutation paths never do this stripping themselves -
// validatePayloadAndAnswer (src/server/questions/service.ts) only
// safeParses payload/answer to VALIDATE their shape, then persists the
// caller's original input verbatim - so a field this form doesn't know
// about would otherwise survive in the DB until this editor loads and
// re-saves it, silently dropping it then.
// ---------------------------------------------------------------------------

const KNOWN_PAYLOAD_KEYS: Record<QuestionFormat, string[]> = {
  single_select: ["options"],
  ordering: ["pool"],
  sort_buckets: ["items", "buckets"],
  fill_blank: ["sentenceParts", "pool"],
  match_pairs: ["left", "right"],
  spot_mistake: ["lines", "lineSources"],
  number_guess: ["unit", "min", "max", "step"],
};

const KNOWN_ANSWER_KEYS: Record<QuestionFormat, string[]> = {
  single_select: ["correctIndex"],
  ordering: ["correctOrder"],
  sort_buckets: ["bucketByItemIndex"],
  fill_blank: ["correctFillIndices"],
  match_pairs: ["rightIndexByLeftIndex"],
  spot_mistake: ["wrongLineIndex"],
  number_guess: ["correctValue", "tolerance"],
};

function extractUnknownKeys(known: string[], value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  const knownSet = new Set(known);
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!knownSet.has(key)) result[key] = v;
  }
  return result;
}

export function extractUnknownPayloadKeys(format: QuestionFormat, payload: unknown): Record<string, unknown> {
  return extractUnknownKeys(KNOWN_PAYLOAD_KEYS[format], payload);
}

export function extractUnknownAnswerKeys(format: QuestionFormat, answer: unknown): Record<string, unknown> {
  return extractUnknownKeys(KNOWN_ANSWER_KEYS[format], answer);
}

// ---------------------------------------------------------------------------
// Maps a server error message (save-time structural/bounds, or publish-time
// missing-translation) onto RHF field paths where a leading payload.xxx/
// answer.xxx/prompt.xxx/explanation.xxx path can be recognized, else a
// plain-English summary line. src/server/questions/service.ts's three
// message shapes, all unchanged by this task:
//   - `Invalid payload for a "${format}" question: payload.x: msg; payload.y: msg`
//   - `Cannot save: answer.correctIndex (5) is out of range for 3 options`
//   - `Cannot publish: missing translation(s) for prompt.hi, payload.options[0].hi`
// (the publish one is comma-joined bare paths; the other two are
// semicolon-joined "path: message"/"path (value) message" clauses, same
// shape validateAnswerBounds's own strings already use).
// ---------------------------------------------------------------------------

export type FieldErrorEntry = { path: string; message: string };

const FIELD_PATH_RE = /^((?:prompt|explanation|payload|answer)(?:\.\w+|\[\d+\])*)/;

function toRhfPath(path: string): string {
  return path.replace(/\[(\d+)\]/g, ".$1");
}

export function parseQuestionError(message: string): { fieldErrors: FieldErrorEntry[]; summary: string[] } {
  const missingMatch = message.match(/^Cannot publish: missing translations? for (.+)$/);
  if (missingMatch) {
    const fieldErrors = missingMatch[1]!.split(",").map((rawPath) => ({
      path: toRhfPath(rawPath.trim()),
      message: "Missing translation - required before publish.",
    }));
    return { fieldErrors, summary: [] };
  }

  let body = message;
  const invalidPrefixMatch = body.match(/^Invalid (?:payload|answer) for a "[^"]+" question:\s*/);
  if (invalidPrefixMatch) {
    body = body.slice(invalidPrefixMatch[0].length);
  } else if (body.startsWith("Cannot save: ")) {
    body = body.slice("Cannot save: ".length);
  } else if (body.startsWith("Cannot publish: ")) {
    body = body.slice("Cannot publish: ".length);
  }

  const fieldErrors: FieldErrorEntry[] = [];
  const summary: string[] = [];
  for (const part of body.split(";").map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(FIELD_PATH_RE);
    if (match) {
      fieldErrors.push({ path: toRhfPath(match[1]!), message: part });
    } else {
      summary.push(part);
    }
  }
  return { fieldErrors, summary };
}
