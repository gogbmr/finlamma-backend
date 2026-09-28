import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { getTopicById, insertTopic, listActiveTopics, listTopics, updateTopicRow } from "./repo";
import type { TopicInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// Cross-domain read (question editor's topic picker, news drafting's topic
// tagging) - no permission check of its own, same reasoning as
// getRankTitleForLevel: reading the active list isn't a staff-only action,
// it's a lookup any authenticated caller in this codebase can make.
export async function listActiveTopicsForPicker() {
  return listActiveTopics();
}

export async function listTopicsForAdmin() {
  return listTopics();
}

export async function createTopicForAdmin(actor: { id: string }, input: TopicInput, meta: RequestMeta) {
  let created;
  try {
    created = await insertTopic(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Order ${input.order} is already in use by another topic`);
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "topics.created",
    targetType: "topics",
    targetId: created.id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateTopicForAdmin(
  actor: { id: string },
  id: string,
  input: TopicInput,
  meta: RequestMeta,
) {
  const previous = await getTopicById(id);
  if (!previous) throw new AppError("NOT_FOUND", "Topic not found");

  let updated;
  try {
    updated = await updateTopicRow(id, input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Order ${input.order} is already in use by another topic`);
    }
    throw err;
  }
  if (!updated) throw new AppError("NOT_FOUND", "Topic not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "topics.updated",
    targetType: "topics",
    targetId: id,
    metadata: { previous: { order: previous.order, name: previous.name, active: previous.active }, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}
