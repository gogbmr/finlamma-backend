import type { WebhookEvent } from "@clerk/nextjs/server";
import { logActivity } from "@/lib/activity-log";
import { consumerClerkUserExists, deleteConsumerClerkUser } from "@/lib/auth";
import { inngest } from "@/lib/inngest";
import { logInternalError, type requestMeta } from "@/lib/http";
import type { users } from "@/db/schema";
import { deleteAllPushTokensForUser } from "@/server/notifications/service";
import { scrubDoubtZoneContentForUser } from "@/server/doubt-zone/service";
import {
  getOnboardingConsentState,
  scrubConsentDataForDeletedUser,
  type OnboardingConsentState,
} from "@/server/onboarding/service";
import { assignRandomHandleIfMissing, getMyHandle } from "@/server/peer-handles/service";
import type { LocalizedText } from "@/server/shared/schemas";
import type { UpdateMeInput } from "./schemas";
import {
  anonymizeUserFromClerk,
  getUserByClerkUserId,
  getUserById,
  listStuckAccountDeletions,
  markDeletionRequested,
  updateUserPrefs,
  upsertUserFromClerk,
} from "./repo";

type UserRow = typeof users.$inferSelect;
type RequestMeta = ReturnType<typeof requestMeta>;

function toMeResponse(
  user: UserRow,
  consentState: OnboardingConsentState,
  handle: LocalizedText | null,
) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastInitial: user.lastInitial,
    handle,
    email: user.email,
    phone: user.phone,
    language: user.language,
    theme: user.theme,
    bio: user.bio,
    state: user.state,
    preferences: user.preferences,
    dobSet: consentState.dobSet,
    isMinor: consentState.isMinor,
    parentConsentStatus: consentState.parentConsentStatus,
  };
}

export async function getMe(user: UserRow) {
  const consentState = await getOnboardingConsentState(user);
  const handle = await getMyHandle(user.id);
  return toMeResponse(user, consentState, handle);
}

export async function updateMe(user: UserRow, input: UpdateMeInput, meta: RequestMeta) {
  const updated = await updateUserPrefs(user.id, input);

  // Field NAMES only, never their values (phase-audit 2026-10-11 finding):
  // `input` can include the learner's own bio text and state, which would
  // otherwise sit permanently in this append-only table (rule 5 - no
  // update/delete path exists, for anyone) with no way to ever erase it,
  // even via account deletion. `changedFields` still gives staff a useful
  // audit trail of WHAT changed, just never the content.
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "user.updated_prefs",
    targetType: "user",
    targetId: user.id,
    metadata: { changedFields: Object.keys(input) },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const consentState = await getOnboardingConsentState(updated);
  const handle = await getMyHandle(updated.id);
  return toMeResponse(updated, consentState, handle);
}

// Account deletion (docs/PRODUCT_SPEC.md Settings, non-negotiable rule 10).
// Phase-audit 2026-10-11: a deletion must now ALWAYS finish, even if the
// caller's own request dies partway through - so this only ever does one
// thing synchronously: durably record that deletion was requested (before
// anything else, so the marker survives even a crash one line later), then
// hand the actual work off to reconcileAccountDeletion below via Inngest.
// requireUser() (src/lib/auth.ts) rejects any further request from this
// account the instant the marker is set (ACCOUNT_DELETION_PENDING) - so a
// half-deleted account can never keep being used while reconciliation
// finishes in the background, typically within seconds.
export async function deleteMe(user: UserRow, meta: RequestMeta): Promise<void> {
  await markDeletionRequested(user.id);

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "user.deletion_requested",
    targetType: "user",
    targetId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  await inngest.send({ name: "account/deletion.requested", data: { userId: user.id } });
}

// The actual deletion work, shared by three triggers: the Inngest event
// deleteMe() above fires (with Inngest's own automatic step-retry/backoff),
// the daily reconciliation sweep's safety net for anything still stuck, and
// the Clerk user.deleted webhook (syncUserFromClerkEvent below) - whichever
// of the three gets there first does the real work; the other two find
// `deletedAt` already set and no-op. Every sub-step is independently
// idempotent, so re-running this from the top after a partial failure is
// always safe, never double-applies anything:
// - consumerClerkUserExists/deleteConsumerClerkUser: closes the gap where
//   the ORIGINAL request died before the Clerk delete itself ever
//   completed, not just the narrower "Clerk succeeded, DB failed" case.
// - anonymizeUserFromClerk: guarded by `deletedAt IS NULL`.
// - scrubConsentDataForDeletedUser: guarded by `parent_contacts.scrubbed_at`.
// - deleteAllPushTokensForUser / scrubDoubtZoneContentForUser: deleting/
//   overwriting already-gone rows is a harmless no-op either way.
// Activity-log metadata here is deliberately userId-only, never an email or
// name, per the founder's explicit instruction for this reconciliation path.
export async function reconcileAccountDeletion(
  userId: string,
  meta: RequestMeta,
): Promise<{ alreadyDone: boolean }> {
  const user = await getUserById(userId);
  if (!user || user.deletedAt) return { alreadyDone: true };

  const clerkStillExists = await consumerClerkUserExists(user.clerkUserId);
  if (clerkStillExists) {
    await deleteConsumerClerkUser(user.clerkUserId);
  }

  await anonymizeUserFromClerk(user.clerkUserId);
  await scrubConsentDataForDeletedUser(userId, meta);
  await deleteAllPushTokensForUser(userId);
  await scrubDoubtZoneContentForUser(userId);

  await logActivity({
    actorType: "system",
    action: "user.deletion_reconciled",
    targetType: "user",
    targetId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { alreadyDone: false };
}

const STUCK_DELETION_ESCALATION_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// The daily safety-net sweep (account-deletion-reconciliation Inngest cron,
// 3:50am IST) for any deletion the event-triggered path above never
// finished - a worklist of users.deletion_requested_at IS NOT NULL AND
// deleted_at IS NULL, which stays tiny in practice (anything healthy falls
// out of it within seconds of the event firing). Each row is retried
// independently (sequential, not Promise.all - rule 15, and so one bad row
// can never block the rest of the batch); a row stuck 3+ days also gets a
// second, distinctly-named log entry, greppable for the Sentry alerting
// that's still an open pre-launch item (docs/ROADMAP.md) - this is the one
// future wiring point, not a bespoke alerting channel built here.
export async function runAccountDeletionReconciliationSweep(): Promise<{
  attempted: number;
  succeeded: number;
}> {
  const stuck = await listStuckAccountDeletions();
  let succeeded = 0;

  for (const row of stuck) {
    try {
      await reconcileAccountDeletion(row.id, { ip: null, userAgent: null });
      succeeded++;
    } catch (err) {
      logInternalError("account_deletion.reconciliation_attempt_failed", err);

      const daysPending = row.deletionRequestedAt
        ? Math.floor((Date.now() - row.deletionRequestedAt.getTime()) / DAY_MS)
        : 0;
      if (daysPending >= STUCK_DELETION_ESCALATION_DAYS) {
        logInternalError(
          "account_deletion.reconciliation_stuck",
          new Error(`userId=${row.id} daysPending=${daysPending}`),
        );
      }
    }
  }

  return { attempted: stuck.length, succeeded };
}

function primaryVerifiedEmail(
  data: Extract<WebhookEvent, { type: "user.created" | "user.updated" }>["data"],
): string | null {
  const primary = data.email_addresses?.find(
    (e) => e.id === data.primary_email_address_id,
  );
  return primary?.verification?.status === "verified"
    ? primary.email_address
    : null;
}

function primaryVerifiedPhone(
  data: Extract<WebhookEvent, { type: "user.created" | "user.updated" }>["data"],
): string | null {
  const primary = data.phone_numbers?.find(
    (p) => p.id === data.primary_phone_number_id,
  );
  return primary?.verification?.status === "verified"
    ? primary.phone_number
    : null;
}

// Handles a verified Clerk webhook event. The route only verifies the
// signature and hands the parsed event here - all sync logic lives in one
// place so it's testable without an HTTP request.
export async function syncUserFromClerkEvent(evt: WebhookEvent) {
  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { data } = evt;
    // firstName only now (D73, docs/ARCHITECTURE.md) - lastInitial is
    // retired going forward, never written for new rows and never touched
    // on existing ones. Peer-visible identity is the handle assigned below.
    await upsertUserFromClerk({
      clerkUserId: data.id,
      firstName: data.first_name || null,
      email: primaryVerifiedEmail(data),
      phone: primaryVerifiedPhone(data),
      clerkUpdatedAt: new Date(data.updated_at),
    });

    // Idempotent (a no-op once a handle is set) - safe to call on every
    // sync, not just account creation, so a user who somehow slipped
    // through without one (a gap predating this feature, or a prior
    // transient failure) self-heals on their next Clerk event too.
    const user = await getUserByClerkUserId(data.id);
    if (user) {
      await assignRandomHandleIfMissing(user.id);
    }

    await logActivity({
      actorType: "system",
      action: "user.synced_from_clerk",
      targetType: "user",
      targetId: data.id,
      metadata: { clerkEventType: evt.type },
    });
    return;
  }

  if (evt.type === "user.deleted") {
    const clerkUserId = evt.data.id;
    if (!clerkUserId) return;

    // One of three triggers for the same shared reconciliation (see
    // reconcileAccountDeletion's own comment above) - whichever gets here
    // first does the real work, idempotently; a webhook redelivery, or one
    // that arrives after deleteMe()'s own Inngest event already finished,
    // is a harmless no-op. No requestMeta for a webhook - same
    // "no ip/userAgent" shape already used for every other webhook-driven
    // logActivity call in this file.
    const user = await getUserByClerkUserId(clerkUserId);
    if (user) {
      await reconcileAccountDeletion(user.id, { ip: null, userAgent: null });
    }

    await logActivity({
      actorType: "system",
      action: "user.deleted_from_clerk",
      targetType: "user",
      targetId: clerkUserId,
    });
  }
}
