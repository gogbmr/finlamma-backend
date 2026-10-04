import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { doubtMessages, doubtThreads, mentors, users, type DoubtMessageFlagCategory } from "@/db/schema";

export async function getThreadById(id: string) {
  const [row] = await db.select().from(doubtThreads).where(eq(doubtThreads.id, id)).limit(1);
  return row ?? null;
}

// One thread per (user, lesson) - reused every time the learner reopens the
// same in-lesson doubt_zone node, same "resume, don't restart" reasoning
// lesson_progress already uses elsewhere in this codebase.
export async function findLessonThread(userId: string, lessonId: string) {
  const [row] = await db
    .select()
    .from(doubtThreads)
    .where(and(eq(doubtThreads.userId, userId), eq(doubtThreads.lessonId, lessonId)))
    .limit(1);
  return row ?? null;
}

// One thread per (user, mentor) for the standalone Doubt Zone entry point
// (lessonId null) - switching mentor there opens a different thread rather
// than silently changing an existing one's persona mid-conversation.
export async function findStandaloneThread(userId: string, mentorId: string) {
  const [row] = await db
    .select()
    .from(doubtThreads)
    .where(
      and(eq(doubtThreads.userId, userId), eq(doubtThreads.mentorId, mentorId), isNull(doubtThreads.lessonId)),
    )
    .limit(1);
  return row ?? null;
}

export async function insertThread(input: { userId: string; mentorId: string; lessonId: string | null }) {
  const [row] = await db
    .insert(doubtThreads)
    .values({ userId: input.userId, mentorId: input.mentorId, lessonId: input.lessonId })
    .returning();
  return row;
}

export async function touchThreadLastMessageAt(threadId: string) {
  await db.update(doubtThreads).set({ lastMessageAt: new Date() }).where(eq(doubtThreads.id, threadId));
}

// Most recent `limit` messages, returned oldest-first (ready to feed
// straight into the model's `messages` array). Capped so a very long-lived
// thread never sends unbounded history/tokens to the model.
export async function listRecentMessages(threadId: string, limit: number) {
  const rows = await db
    .select()
    .from(doubtMessages)
    .where(eq(doubtMessages.threadId, threadId))
    .orderBy(desc(doubtMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

// Cursor-paginated full history for GET .../messages - newest-first with a
// "load older" cursor, same convention as every other list endpoint in this
// codebase (e.g. src/server/economy/repo.ts's wallet ledger history).
export async function listMessagesPage(threadId: string, opts: { limit: number; before?: Date }) {
  const conditions = [eq(doubtMessages.threadId, threadId)];
  if (opts.before) conditions.push(lt(doubtMessages.createdAt, opts.before));
  return db
    .select()
    .from(doubtMessages)
    .where(and(...conditions))
    .orderBy(desc(doubtMessages.createdAt))
    .limit(opts.limit);
}

export async function insertMessage(input: {
  threadId: string;
  role: "learner" | "assistant";
  content: string;
  flagged: boolean;
  flaggedCategory?: DoubtMessageFlagCategory | null;
  flaggedReason: string | null;
}) {
  const [row] = await db
    .insert(doubtMessages)
    .values({
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      flagged: input.flagged,
      flaggedCategory: input.flaggedCategory ?? null,
      flaggedReason: input.flaggedReason,
    })
    .returning();
  return row;
}

// category is the coarse, list-safe label (never free text - see
// doubtMessageFlagCategoryEnum's own doc comment); reason is optional free
// text (a classifier-written explanation, which can paraphrase/quote the
// learner's own words) that's stored but NEVER selected by
// listFlaggedMessagesForReview below - only revealFlaggedMessageContent's
// logged reveal returns it.
export async function markMessageFlagged(
  id: string,
  category: DoubtMessageFlagCategory,
  reason: string | null = null,
) {
  await db
    .update(doubtMessages)
    .set({ flagged: true, flaggedCategory: category, flaggedReason: reason })
    .where(eq(doubtMessages.id, id));
}

export async function getMessageById(id: string) {
  const [row] = await db.select().from(doubtMessages).where(eq(doubtMessages.id, id)).limit(1);
  return row ?? null;
}

// --- Staff (admin, doubt_zone.moderate) ---

// Metadata only - deliberately never selects `content` OR `flaggedReason`
// (/phase-audit 7 finding: flaggedReason can be a classifier-written
// paraphrase/quote of the learner's own words, which is exactly the kind
// of sensitive content the flagged-only design means to gate behind a
// logged reveal, not show on every page load). flaggedCategory is the
// coarse, never-free-text label safe enough for triage in the list itself.
// Same "list is metadata-only, a separate always-logged function reveals
// the sensitive fields" split as src/server/onboarding/repo.ts's
// listConsentRecordsForReview / getParentContactForReview.
export async function listFlaggedMessagesForReview(opts: { includeReviewed: boolean; limit: number }) {
  const conditions = [eq(doubtMessages.flagged, true)];
  if (!opts.includeReviewed) conditions.push(isNull(doubtMessages.reviewedAt));
  return db
    .select({
      id: doubtMessages.id,
      threadId: doubtMessages.threadId,
      role: doubtMessages.role,
      flaggedCategory: doubtMessages.flaggedCategory,
      createdAt: doubtMessages.createdAt,
      reviewedAt: doubtMessages.reviewedAt,
      firstName: users.firstName,
      lastInitial: users.lastInitial,
      mentorName: mentors.name,
    })
    .from(doubtMessages)
    .innerJoin(doubtThreads, eq(doubtThreads.id, doubtMessages.threadId))
    .innerJoin(users, eq(users.id, doubtThreads.userId))
    .innerJoin(mentors, eq(mentors.id, doubtThreads.mentorId))
    .where(and(...conditions))
    .orderBy(desc(doubtMessages.createdAt))
    .limit(opts.limit);
}

export async function markMessageReviewed(id: string, staffId: string) {
  await db
    .update(doubtMessages)
    .set({ reviewedAt: new Date(), reviewedBy: staffId })
    .where(eq(doubtMessages.id, id));
}
