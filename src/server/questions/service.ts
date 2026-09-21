import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { findMissingLocalizedText } from "@/server/shared/schemas";
import {
  getQuestionById,
  insertDraftQuestion,
  listAllQuestions,
  publishQuestionRow,
  unpublishQuestionRow,
  updateDraftQuestion,
} from "./repo";
import {
  answerSchemaForFormat,
  payloadSchemaForFormat,
  validateAnswerBounds,
  type CreateQuestionDraftInput,
  type QuestionFormat,
  type UpdateQuestionDraftInput,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type QuestionRow = NonNullable<Awaited<ReturnType<typeof getQuestionById>>>;

export async function getQuestionEditorData() {
  return listAllQuestions();
}

// Re-validates payload/answer structural shape + cross-field bounds against
// the *existing* question's format (immutable, not part of `input` - see
// UpdateQuestionDraftSchema), since a Zod schema alone can't know which
// format's shape applies without first reading the row. Mirrors
// src/server/lessons/service.ts's updateLessonDraft exactly.
function validatePayloadAndAnswer(format: QuestionFormat, payload: unknown, answer: unknown): void {
  const payloadResult = payloadSchemaForFormat(format).safeParse(payload);
  if (!payloadResult.success) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Invalid payload for a "${format}" question: ${payloadResult.error.issues
        .map((i) => `payload.${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const answerResult = answerSchemaForFormat(format).safeParse(answer);
  if (!answerResult.success) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Invalid answer for a "${format}" question: ${answerResult.error.issues
        .map((i) => `answer.${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const boundsErrors = validateAnswerBounds(format, payload, answer);
  if (boundsErrors.length > 0) {
    throw new AppError("VALIDATION_FAILED", `Cannot save: ${boundsErrors.join("; ")}`, {
      boundsErrors,
    });
  }
}

export async function createQuestionDraft(
  actor: { id: string },
  input: CreateQuestionDraftInput,
  meta: RequestMeta,
) {
  const created = await insertDraftQuestion(input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "question.created",
    targetType: "question",
    targetId: created.id,
    metadata: { format: created.format },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateQuestionDraft(
  actor: { id: string },
  input: UpdateQuestionDraftInput,
  meta: RequestMeta,
) {
  const existing = await getQuestionById(input.id);
  if (!existing) throw new AppError("NOT_FOUND", "Question not found");

  validatePayloadAndAnswer(existing.format as QuestionFormat, input.payload, input.answer);

  const updated = await updateDraftQuestion(input);
  if (!updated) {
    throw new AppError(
      "CONFLICT",
      "Question not found, or it's currently published - unpublish it first to edit",
    );
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "question.draft_saved",
    targetType: "question",
    targetId: updated.id,
    metadata: { format: updated.format },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// Publish is blocked until every en/hi/hx leaf (prompt, explanation, and
// every LocalizedText leaf inside payload) is filled, named by exact path -
// same findMissingLocalizedText-powered pattern as mentors/worlds/lessons.
// Structural shape and answer bounds are already guaranteed by this point
// (enforced on every save, not just publish - see validatePayloadAndAnswer
// above), so publish only has translations left to check.
function validateQuestionForPublish(question: QuestionRow): void {
  const missingFields = [
    ...findMissingLocalizedText(question.prompt, "prompt"),
    ...findMissingLocalizedText(question.explanation, "explanation"),
    ...findMissingLocalizedText(question.payload, "payload"),
  ];
  if (missingFields.length === 0) return;

  throw new AppError(
    "VALIDATION_FAILED",
    `Cannot publish: missing translation${missingFields.length > 1 ? "s" : ""} for ${missingFields.join(", ")}`,
    { missingFields },
  );
}

export async function publishQuestion(actor: { id: string }, id: string, meta: RequestMeta) {
  const question = await getQuestionById(id);
  if (!question) throw new AppError("NOT_FOUND", "Question not found");
  if (question.status !== "draft") {
    throw new AppError("CONFLICT", "Question is not a draft");
  }
  validateQuestionForPublish(question);

  const published = await publishQuestionRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "Question is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "question.published",
    targetType: "question",
    targetId: published.id,
    metadata: { format: published.format },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

export async function unpublishQuestion(actor: { id: string }, id: string, meta: RequestMeta) {
  const unpublished = await unpublishQuestionRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "Question not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "question.unpublished",
    targetType: "question",
    targetId: unpublished.id,
    metadata: { format: unpublished.format },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}
