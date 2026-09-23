import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import {
  deleteRankTitleRow,
  getRankTitleById,
  getRankTitleForLevel as getRankTitleForLevelRow,
  insertRankTitle,
  listRankTitles,
  updateRankTitleRow,
} from "./repo";
import type { RankTitleInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// Public, pure read - used by src/server/profile/service.ts's overview
// endpoint for every learner, not just staff, so it takes no permission
// check of its own.
export async function getRankTitleForLevel(level: number) {
  return getRankTitleForLevelRow(level);
}

export async function listRankTitlesForAdmin() {
  return listRankTitles();
}

export async function createRankTitleForAdmin(
  actor: { id: string },
  input: RankTitleInput,
  meta: RequestMeta,
) {
  let created;
  try {
    created = await insertRankTitle(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Min level ${input.minLevel} is already in use by another rank title`);
    }
    throw err;
  }
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "rank_titles.created",
    targetType: "rank_titles",
    targetId: created.id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateRankTitleForAdmin(
  actor: { id: string },
  id: string,
  input: RankTitleInput,
  meta: RequestMeta,
) {
  const previous = await getRankTitleById(id);
  if (!previous) throw new AppError("NOT_FOUND", "Rank title not found");

  let updated;
  try {
    updated = await updateRankTitleRow(id, input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", `Min level ${input.minLevel} is already in use by another rank title`);
    }
    throw err;
  }
  if (!updated) throw new AppError("NOT_FOUND", "Rank title not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "rank_titles.updated",
    targetType: "rank_titles",
    targetId: id,
    metadata: { previous: { minLevel: previous.minLevel, title: previous.title }, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function deleteRankTitleForAdmin(
  actor: { id: string },
  id: string,
  meta: RequestMeta,
) {
  const deleted = await deleteRankTitleRow(id);
  if (!deleted) throw new AppError("NOT_FOUND", "Rank title not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "rank_titles.deleted",
    targetType: "rank_titles",
    targetId: id,
    metadata: { minLevel: deleted.minLevel, title: deleted.title },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return deleted;
}
