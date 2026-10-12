import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import { isForeignKeyViolation } from "@/lib/db-errors";
import { logInternalError, type requestMeta } from "@/lib/http";
import type { LocalizedText } from "@/server/shared/schemas";
import type { PeerHandleInput, PeerHandleUpdateInput } from "./schemas";
import {
  deletePeerHandleRow,
  getHandlesForUserIds,
  getPeerHandleById,
  getUserHandleState,
  insertPeerHandle,
  listActivePeerHandles,
  listPeerHandles,
  listUserIdsWithoutHandle,
  pickRandomActivePeerHandleId,
  setUserHandle,
  setUserHandleAndRerolledAt,
  updatePeerHandleRow,
} from "./repo";

type RequestMeta = ReturnType<typeof requestMeta>;

const REROLL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// Account creation (src/server/users/service.ts syncUserFromClerkEvent) and
// the one-off backfill script (scripts/backfill-peer-handles.ts) both call
// this - idempotent (a no-op if the user already has a handle), so calling
// it unconditionally on every Clerk sync is always safe. Deliberately never
// throws through to the caller: handle assignment must never block account
// creation itself (a missing/misconfigured catalog is a staff problem to
// fix, not a reason to fail signup) - logs and returns false instead.
export async function assignRandomHandleIfMissing(userId: string): Promise<boolean> {
  try {
    const current = await getUserHandleState(userId);
    if (!current || current.handleId) return false;

    const handleId = await pickRandomActivePeerHandleId();
    if (!handleId) {
      logInternalError(
        "peer_handles.no_active_handles",
        new Error(`No active peer_handles row exists - userId=${userId} left without a handle`),
      );
      return false;
    }

    await setUserHandle(userId, handleId);
    return true;
  } catch (err) {
    logInternalError("peer_handles.assign_failed", err);
    return false;
  }
}

// GET /me's own-handle field - private-ish in the sense that it's the
// caller's own data, not a peer-visible lookup (getHandlesForUserIds is the
// one used to resolve OTHER learners' handles).
export async function getMyHandle(userId: string): Promise<LocalizedText | null> {
  const map = await getHandlesForUserIds([userId]);
  return map.get(userId) ?? null;
}

export type RerollResult = { handle: LocalizedText; nextRerollAvailableAt: string };

// One self-reroll per 30 days (founder decision, D73) - the cooldown is
// computed from handleRerolledAt, never updatedAt (plenty of other fields
// touch that column too), and never allowed before the user has a handle
// to reroll FROM in the first place (shouldn't happen once account-creation
// assignment/backfill have both run, but fails clearly rather than silently
// assigning one here if it somehow does).
export async function rerollMyHandle(
  user: { id: string },
  meta: RequestMeta,
): Promise<RerollResult> {
  const current = await getUserHandleState(user.id);
  if (!current?.handleId) {
    throw new AppError("NOT_FOUND", "No handle assigned yet - contact support");
  }

  if (current.handleRerolledAt) {
    const nextAvailable = current.handleRerolledAt.getTime() + REROLL_COOLDOWN_MS;
    if (Date.now() < nextAvailable) {
      throw new AppError("RESEND_TOO_SOON", "You can reroll your handle again in a bit", {
        retryAfterSeconds: Math.ceil((nextAvailable - Date.now()) / 1000),
        nextRerollAvailableAt: new Date(nextAvailable).toISOString(),
      });
    }
  }

  const newHandleId = await pickRandomActivePeerHandleId(current.handleId);
  if (!newHandleId) {
    throw new AppError("SERVICE_UNAVAILABLE", "No handle is available to reroll into right now");
  }

  await setUserHandleAndRerolledAt(user.id, newHandleId);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "peer_handle.rerolled",
    targetType: "user",
    targetId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const map = await getHandlesForUserIds([user.id]);
  const handle = map.get(user.id);
  if (!handle) throw new AppError("INTERNAL", "Handle reroll succeeded but could not be read back");

  return {
    handle,
    nextRerollAvailableAt: new Date(Date.now() + REROLL_COOLDOWN_MS).toISOString(),
  };
}

// The one-off backfill (scripts/backfill-peer-handles.ts) - sequential, not
// Promise.all'd (rule 15), since this can run against however many
// pre-existing users there are. Safe to run again: assignRandomHandleIfMissing
// is itself a no-op for anyone who already has a handle.
export async function backfillMissingHandles(): Promise<{ assigned: number; total: number }> {
  const userIds = await listUserIdsWithoutHandle();
  let assigned = 0;
  for (const userId of userIds) {
    if (await assignRandomHandleIfMissing(userId)) assigned++;
  }
  return { assigned, total: userIds.length };
}

// --- Staff (admin, settings.manage - same bar as about_me_chips) ---

export async function listPeerHandlesForAdmin() {
  return listPeerHandles();
}

export async function createPeerHandleForAdmin(
  actor: { id: string },
  input: PeerHandleInput,
  meta: RequestMeta,
) {
  const created = await insertPeerHandle(input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "peer_handles.created",
    targetType: "peer_handles",
    targetId: created.id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updatePeerHandleForAdmin(
  actor: { id: string },
  id: string,
  input: PeerHandleUpdateInput,
  meta: RequestMeta,
) {
  const previous = await getPeerHandleById(id);
  if (!previous) throw new AppError("NOT_FOUND", "Handle not found");

  const updated = await updatePeerHandleRow(id, input);
  if (!updated) throw new AppError("NOT_FOUND", "Handle not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "peer_handles.updated",
    targetType: "peer_handles",
    targetId: id,
    metadata: { previous: { name: previous.name, active: previous.active }, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// Same `restrict`-on-delete pattern as about_me_chips: deleting a handle
// still assigned to at least one learner fails loudly rather than silently
// orphaning their assignment. Staff should retire (active: false) a handle
// that's in use.
export async function deletePeerHandleForAdmin(
  actor: { id: string },
  id: string,
  meta: RequestMeta,
) {
  const existing = await getPeerHandleById(id);
  if (!existing) throw new AppError("NOT_FOUND", "Handle not found");

  try {
    await deletePeerHandleRow(id);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new AppError(
        "CONFLICT",
        "This handle is assigned to at least one learner - turn it off (inactive) instead of deleting it",
      );
    }
    throw err;
  }

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "peer_handles.deleted",
    targetType: "peer_handles",
    targetId: id,
    metadata: { name: existing.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export async function listActiveHandlesForAdmin() {
  return listActivePeerHandles();
}

export { getHandlesForUserIds };
