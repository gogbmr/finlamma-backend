import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import { decodeCursor, encodeCursor, logInternalError, type requestMeta } from "@/lib/http";
import { checkRateLimit, DOUBT_ZONE_MESSAGE_RATE_LIMIT } from "@/lib/redis";
import { getPublishedLesson } from "@/server/lessons/repo";
import { getMentorById } from "@/server/mentors/repo";
import { getWorldById } from "@/server/worlds/repo";
import { buildDoubtZoneSystemPrompt, type DoubtZoneLanguage } from "./prompt";
import {
  findLessonThread,
  findStandaloneThread,
  getMessageById,
  getThreadById,
  insertMessage,
  insertThread,
  listFlaggedMessagesForReview,
  listMessagesPage,
  listRecentMessages,
  markMessageFlagged,
  markMessageReviewed,
  touchThreadLastMessageAt,
} from "./repo";
import { streamDoubtZoneReply, type DoubtZoneChatMessage } from "./reply";
import { classifyMessageSafety, isFlaggableSafetyCategory } from "./safety";
import type { CreateThreadInput } from "./schemas";
import { getDoubtZoneSafetySettings } from "./settings";

type RequestMeta = ReturnType<typeof requestMeta>;
type DoubtZoneUser = { id: string; language: DoubtZoneLanguage };

export type DoubtZoneStreamLine =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; replaced: boolean; replacementText?: string };

// A very long-lived thread never sends unbounded history/tokens to the
// model - the most recent RECENT_MESSAGE_HISTORY_LIMIT messages (learner +
// assistant) are all the context a live chat reply needs.
const RECENT_MESSAGE_HISTORY_LIMIT = 20;

// lessonId set: mentor is derived server-side from the lesson's world,
// NEVER trusted from the client - a learner could otherwise ask for any
// mentor's voice on any lesson's thread. lessonId omitted (the standalone
// entry point): the client must say which mentor, since the app already
// knows which mentor it's showing on whatever screen opened this chat.
async function resolveMentorAndLessonContext(input: CreateThreadInput, language: DoubtZoneLanguage) {
  if (input.lessonId) {
    const lesson = await getPublishedLesson(input.lessonId);
    if (!lesson) throw new AppError("NOT_FOUND", "No published lesson with this id");
    const world = await getWorldById(lesson.worldId);
    if (!world) throw new AppError("NOT_FOUND", "Lesson's world no longer exists");
    return { mentorId: world.mentorId, lessonId: lesson.id as string | null, lessonTopic: lesson.title[language] };
  }
  if (!input.mentorId) {
    throw new AppError("VALIDATION_FAILED", "mentorId is required when lessonId is omitted");
  }
  const mentor = await getMentorById(input.mentorId);
  if (!mentor || mentor.status !== "published") {
    throw new AppError("NOT_FOUND", "No published mentor with this id");
  }
  return { mentorId: mentor.id, lessonId: null as string | null, lessonTopic: undefined as string | undefined };
}

export async function createOrGetThread(user: DoubtZoneUser, input: CreateThreadInput, meta: RequestMeta) {
  const { mentorId, lessonId } = await resolveMentorAndLessonContext(input, user.language);

  const existing = lessonId
    ? await findLessonThread(user.id, lessonId)
    : await findStandaloneThread(user.id, mentorId);

  const thread = existing ?? (await insertThread({ userId: user.id, mentorId, lessonId }));
  if (!existing) {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "doubt_zone.thread_created",
      targetType: "doubt_thread",
      targetId: thread.id,
      metadata: { mentorId, lessonId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  const settings = await getDoubtZoneSafetySettings();
  return {
    id: thread.id,
    mentorId: thread.mentorId,
    lessonId: thread.lessonId,
    disclosureMessage: settings.threadDisclosureMessage[user.language],
  };
}

export async function listThreadMessages(
  user: { id: string },
  threadId: string,
  opts: { limit: number; cursor: string | null },
) {
  const thread = await getThreadById(threadId);
  if (!thread || thread.userId !== user.id) {
    throw new AppError("NOT_FOUND", "No Doubt Zone thread with this id");
  }

  const cursor = decodeCursor<{ createdAt: string }>(opts.cursor);
  const rows = await listMessagesPage(threadId, {
    limit: opts.limit,
    before: cursor ? new Date(cursor.createdAt) : undefined,
  });
  const last = rows[rows.length - 1];
  const nextCursor =
    rows.length === opts.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString() }) : null;

  return {
    data: rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt.toISOString() })),
    nextCursor,
  };
}

export type PreparedMessage =
  | { kind: "flagged"; assistantMessageId: string; replacementText: string }
  | { kind: "needs_reply"; systemPrompt: string; chatMessages: DoubtZoneChatMessage[] };

// Everything that can be decided/persisted synchronously, BEFORE any
// streaming response is opened: thread ownership, rate limits (all fail
// CLOSED - every message is a real, cost-bearing Anthropic call, same
// reasoning src/lib/redis.ts documents for trade order placement, applied
// here to API spend instead of money), storing the learner's message, and
// the safety classification gate (./safety.ts - fails closed, awaited
// BEFORE the main reply is even considered, never in parallel with it).
// Thrown AppErrors here become a normal JSON error response (the route
// handler hasn't opened the stream yet) - only a "needs_reply" result ever
// reaches the actual Anthropic reply call, in streamReplyAndPersist below.
export async function prepareMessage(
  user: DoubtZoneUser,
  threadId: string,
  content: string,
  meta: RequestMeta,
): Promise<PreparedMessage> {
  const thread = await getThreadById(threadId);
  if (!thread || thread.userId !== user.id) {
    throw new AppError("NOT_FOUND", "No Doubt Zone thread with this id");
  }

  const settings = await getDoubtZoneSafetySettings();

  const burst = await checkRateLimit(user.id, DOUBT_ZONE_MESSAGE_RATE_LIMIT, false);
  if (!burst.allowed) {
    throw new AppError("RATE_LIMITED", "Too many messages - slow down and try again shortly");
  }
  const dailyUser = await checkRateLimit(
    `user:${user.id}`,
    { requests: settings.perLearnerDailyMessageCap, window: "1 d", prefix: "ratelimit:doubt-zone-daily-user" },
    false,
  );
  if (!dailyUser.allowed) {
    throw new AppError("RATE_LIMITED", "You've reached today's Doubt Zone message limit - try again tomorrow");
  }
  const dailyGlobal = await checkRateLimit(
    "global",
    { requests: settings.globalDailyMessageCap, window: "1 d", prefix: "ratelimit:doubt-zone-daily-global" },
    false,
  );
  if (!dailyGlobal.allowed) {
    throw new AppError("RATE_LIMITED", "Lamma AI is very busy right now - please try again later");
  }

  const learnerMessage = await insertMessage({
    threadId,
    role: "learner",
    content,
    flagged: false,
    flaggedReason: null,
  });

  // /phase-audit 7 finding: classifyMessageSafety fails closed (throws)
  // when the classifier itself can't run - which correctly stops any AI
  // reply, but previously left the already-inserted learner message
  // sitting as flagged: false forever, indistinguishable from a message
  // the classifier actually cleared. A genuine outage now still flags the
  // message (category "classifier_unavailable") so a human looks at it,
  // before the SERVICE_UNAVAILABLE error is re-thrown to the client
  // exactly as before.
  let classification: Awaited<ReturnType<typeof classifyMessageSafety>>;
  try {
    classification = await classifyMessageSafety(content);
  } catch (err) {
    await markMessageFlagged(learnerMessage.id, "classifier_unavailable");
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "doubt_zone.message_flagged_classifier_unavailable",
      targetType: "doubt_message",
      targetId: learnerMessage.id,
      metadata: { threadId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw err;
  }
  if (isFlaggableSafetyCategory(classification, settings.flagOnAnySignal)) {
    // Safe: isFlaggableSafetyCategory already excludes "none" above.
    await markMessageFlagged(
      learnerMessage.id,
      classification.category as Exclude<typeof classification.category, "none">,
      classification.reason,
    );
    const replacementText = settings.safetyRedirectMessage[user.language];
    const assistantMessage = await insertMessage({
      threadId,
      role: "assistant",
      content: replacementText,
      flagged: false,
      flaggedReason: null,
    });
    await touchThreadLastMessageAt(threadId);
    // Never logs message content - only that a flag happened and which
    // category, matching the flagged-only staff-visibility design (full
    // content stays gated behind doubt_zone.moderate + doubt_messages,
    // never activity_logs).
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "doubt_zone.message_flagged_by_safety_classifier",
      targetType: "doubt_message",
      targetId: learnerMessage.id,
      metadata: { threadId, category: classification.category },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { kind: "flagged", assistantMessageId: assistantMessage.id, replacementText };
  }

  const mentor = await getMentorById(thread.mentorId);
  let lessonTopic: string | undefined;
  if (thread.lessonId) {
    const lesson = await getPublishedLesson(thread.lessonId);
    lessonTopic = lesson?.title[user.language];
  }

  const systemPrompt = buildDoubtZoneSystemPrompt({
    mentorPersona: mentor?.persona ?? "",
    language: user.language,
    lessonTopic,
  });

  const history = await listRecentMessages(threadId, RECENT_MESSAGE_HISTORY_LIMIT);
  const chatMessages: DoubtZoneChatMessage[] = [
    ...history.map((m) => ({
      role: (m.role === "learner" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content },
  ];

  return { kind: "needs_reply", systemPrompt, chatMessages };
}

// Only ever called with a "needs_reply" PreparedMessage, once the caller has
// already opened the streaming response - so unlike prepareMessage, this
// never throws: every failure path (advice-language cut, a genuine
// mid-stream Anthropic error) resolves into a `done` line instead, since
// there is no way to turn a thrown error into a clean HTTP status after the
// stream has already started.
export async function streamReplyAndPersist(
  user: DoubtZoneUser,
  threadId: string,
  prepared: Extract<PreparedMessage, { kind: "needs_reply" }>,
  emit: (line: DoubtZoneStreamLine) => void,
  meta: RequestMeta,
): Promise<void> {
  const settings = await getDoubtZoneSafetySettings();

  let outcome: Awaited<ReturnType<typeof streamDoubtZoneReply>>;
  try {
    outcome = await streamDoubtZoneReply({ systemPrompt: prepared.systemPrompt, messages: prepared.chatMessages }, (accumulated) =>
      emit({ type: "delta", text: accumulated }),
    );
  } catch (err) {
    logInternalError("doubt_zone.stream_reply_failed_mid_stream", err);
    const replacementText = settings.temporaryUnavailableMessage[user.language];
    const assistantMessage = await insertMessage({
      threadId,
      role: "assistant",
      content: replacementText,
      flagged: false,
      flaggedReason: null,
    });
    await touchThreadLastMessageAt(threadId);
    emit({ type: "done", messageId: assistantMessage.id, replaced: true, replacementText });
    return;
  }

  if (outcome.kind === "cut_for_advice_language") {
    const replacementText = settings.adviceLanguageFallbackMessage[user.language];
    const assistantMessage = await insertMessage({
      threadId,
      role: "assistant",
      content: replacementText,
      flagged: true,
      flaggedCategory: "advice_language",
      flaggedReason: outcome.matchedPhrases.join(","),
    });
    await touchThreadLastMessageAt(threadId);
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "doubt_zone.reply_cut_for_advice_language",
      targetType: "doubt_message",
      targetId: assistantMessage.id,
      metadata: { threadId, matchedPhrases: outcome.matchedPhrases },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    emit({ type: "done", messageId: assistantMessage.id, replaced: true, replacementText });
    return;
  }

  const assistantMessage = await insertMessage({
    threadId,
    role: "assistant",
    content: outcome.text,
    flagged: false,
    flaggedReason: null,
  });
  await touchThreadLastMessageAt(threadId);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "doubt_zone.message_sent",
    targetType: "doubt_message",
    targetId: assistantMessage.id,
    metadata: { threadId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  emit({ type: "done", messageId: assistantMessage.id, replaced: false });
}

// --- Report a bad reply (learner-facing) ---

// A learner can only report an assistant reply in their own thread. Never
// throws on a re-report of an already-flagged message (idempotent) - the
// second report is still meaningful staff signal, so it's still logged,
// just doesn't re-flip a flag that's already set.
export async function reportMessage(
  user: { id: string },
  threadId: string,
  messageId: string,
  meta: RequestMeta,
): Promise<void> {
  const thread = await getThreadById(threadId);
  if (!thread || thread.userId !== user.id) {
    throw new AppError("NOT_FOUND", "No Doubt Zone thread with this id");
  }
  const message = await getMessageById(messageId);
  if (!message || message.threadId !== threadId) {
    throw new AppError("NOT_FOUND", "No message with this id in this thread");
  }
  if (message.role !== "assistant") {
    throw new AppError("VALIDATION_FAILED", "Only an assistant reply can be reported");
  }

  if (!message.flagged) {
    await markMessageFlagged(message.id, "learner_reported");
  }
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "doubt_zone.message_reported",
    targetType: "doubt_message",
    targetId: message.id,
    metadata: { threadId, alreadyFlagged: message.flagged },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// --- Staff moderation queue (doubt_zone.moderate) ---

// Metadata only (see repo's own doc comment) - never includes message
// content. The queue defaults to pending-only (includeReviewed: false);
// reviewing never un-flags a message.
export async function listFlaggedMessagesForModeration(opts: { includeReviewed: boolean; limit: number }) {
  return listFlaggedMessagesForReview(opts);
}

// The one path that reveals a flagged message's content to staff - always
// logged (actor = the staff member, target = the message), same pattern as
// src/server/onboarding/service.ts's revealParentContact for parent PII.
// Never called from the queue's list render, only from an explicit staff
// action.
export async function revealFlaggedMessageContent(actor: { id: string }, messageId: string, meta: RequestMeta) {
  const message = await getMessageById(messageId);
  if (!message || !message.flagged) {
    throw new AppError("NOT_FOUND", "No flagged message with this id");
  }

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "doubt_zone.flagged_message_viewed",
    targetType: "doubt_message",
    targetId: message.id,
    metadata: { threadId: message.threadId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { content: message.content, role: message.role, flaggedReason: message.flaggedReason };
}

export async function markFlaggedMessageReviewed(actor: { id: string }, messageId: string, meta: RequestMeta) {
  const message = await getMessageById(messageId);
  if (!message || !message.flagged) {
    throw new AppError("NOT_FOUND", "No flagged message with this id");
  }

  await markMessageReviewed(messageId, actor.id);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "doubt_zone.flagged_message_reviewed",
    targetType: "doubt_message",
    targetId: message.id,
    metadata: { threadId: message.threadId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
