import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  consentRecords,
  legalAcceptances,
  legalReapprovalRequests,
  parentContacts,
  users,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";

// Guarded by `where isNull(dateOfBirth)` even though the service layer
// already checks this first, so a race between two concurrent requests
// can't both "win" - returns null (not the row) if it was already set.
export async function setDateOfBirthOnce(userId: string, dateOfBirth: string) {
  const [updated] = await db
    .update(users)
    .set({ dateOfBirth })
    .where(and(eq(users.id, userId), isNull(users.dateOfBirth)))
    .returning();
  return updated ?? null;
}

// Used to personalize the consent request/receipt emails and the public
// consent page - never anything more sensitive than the same kid-safe
// first name already shown throughout the app.
export async function getUserFirstName(userId: string): Promise<string | null> {
  const [row] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.firstName ?? null;
}

// Account deletion (src/server/users/service.ts deleteMe()) soft-deletes
// in place - it never removes the users row itself, so a stale consent/
// decline/withdraw token's consent_records row survives untouched and
// would otherwise still work. Every public consent-page entry point checks
// this so a deleted account's tokens go dead the same way an
// already-resolved one does, rather than staying silently actionable.
export async function isUserDeleted(userId: string): Promise<boolean> {
  const [row] = await db.select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return row ? row.deletedAt !== null : true; // no row at all is treated the same as deleted
}

export async function getParentContact(userId: string) {
  const [row] = await db
    .select()
    .from(parentContacts)
    .where(eq(parentContacts.userId, userId))
    .limit(1);
  return row ?? null;
}

// One row per user (unique on user_id - see src/db/schema/compliance.ts),
// updated in place if the parent's details change on a resend.
export async function upsertParentContact(userId: string, name: string, email: string) {
  const existing = await getParentContact(userId);
  if (existing) {
    const [updated] = await db
      .update(parentContacts)
      .set({ name, email })
      .where(eq(parentContacts.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(parentContacts).values({ userId, name, email }).returning();
  return created;
}

// Excludes deleted accounts, so a parent email that only backs since-deleted
// (test/abandoned) accounts doesn't stay permanently maxed out - a deletion
// audit found this wasn't excluded, which could lock a parent out of
// consenting for a real, current child.
export async function countChildrenForParentEmail(email: string): Promise<number> {
  const rows = await db
    .select({ userId: parentContacts.userId })
    .from(parentContacts)
    .innerJoin(users, eq(users.id, parentContacts.userId))
    .where(and(eq(parentContacts.email, email), isNull(users.deletedAt)));
  return rows.length;
}

export async function getConsentRecord(userId: string) {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getConsentRecordByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

// Sums request_count across every consent_records row whose parent_contacts
// email matches, for today's UTC date - the per-parent-email half of the
// daily resend cap (the per-user half just reads the caller's own row).
// Volumes here are tiny (a handful of children per email at most), so this
// is a plain filter-in-JS rather than a date-filtered SQL aggregate.
// Excludes deleted accounts, same reasoning as countChildrenForParentEmail.
export async function sumRequestsTodayForParentEmail(
  email: string,
  todayUtc: string,
): Promise<number> {
  const rows = await db
    .select({ requestCount: consentRecords.requestCount, requestCountDate: consentRecords.requestCountDate })
    .from(consentRecords)
    .innerJoin(parentContacts, eq(parentContacts.id, consentRecords.parentContactId))
    .innerJoin(users, eq(users.id, consentRecords.userId))
    .where(and(eq(parentContacts.email, email), isNull(users.deletedAt)));
  return rows
    .filter((r) => r.requestCountDate === todayUtc)
    .reduce((sum, r) => sum + r.requestCount, 0);
}

type ConsentRecordRow = typeof consentRecords.$inferSelect;

type ClaimConsentRequestInput = {
  userId: string;
  parentContactId: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  todayUtc: string;
  cooldownMs: number;
  dailyCap: number;
};

export type ClaimConsentRequestResult =
  | { ok: true; record: ConsentRecordRow }
  | { ok: false; reason: "too_soon"; retryAfterSeconds: number }
  | { ok: false; reason: "daily_cap" };

// Atomically checks the 60s cooldown and the per-user daily cap, and writes
// the new token, in one transaction with the row locked (`for("update")`)
// for its duration - closes a race a security audit found in an earlier
// version of this function, where concurrent requests could each read the
// same stale lastRequestedAt/requestCount and all pass the checks before
// any of them committed, letting one account blow past both the cooldown
// and the daily cap. Sequential awaited queries inside one transaction are
// safe against Supabase's transaction-pooler per docs/ARCHITECTURE.md
// decision D13 (that bug was concurrent/pipelined queries on one
// connection, not a held transaction - a transaction is exactly what
// pooler's "transaction mode" is designed to hold).
//
// The per-parent-email cap is deliberately NOT made atomic here - doing so
// would require locking every consent_records row across every user
// sharing that email, which needs serializable isolation (with retry
// logic) to fully close, not just a row lock. Left as a documented,
// lower-severity residual risk: exploiting it needs multiple coordinated
// accounts racing in lockstep, not just one account hammering this
// endpoint - see the security audit that flagged this on 2026-09-20.
export async function claimConsentRequestSlot(
  input: ClaimConsentRequestInput,
): Promise<ClaimConsentRequestResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, input.userId))
      .for("update")
      .limit(1);

    const now = new Date();

    if (!existing) {
      // First-ever request for this user - always allowed. On the
      // vanishingly rare chance two concurrent first-ever requests both
      // found no row to lock, the loser hits the user_id unique index and
      // is told to retry rather than crashing with an unhandled 500.
      try {
        const [created] = await tx
          .insert(consentRecords)
          .values({
            userId: input.userId,
            parentContactId: input.parentContactId,
            status: "pending",
            tokenHash: input.tokenHash,
            tokenExpiresAt: input.tokenExpiresAt,
            lastRequestedAt: now,
            requestCount: 1,
            requestCountDate: input.todayUtc,
          })
          .returning();
        return { ok: true, record: created };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, reason: "too_soon", retryAfterSeconds: 1 };
        }
        throw err;
      }
    }

    if (existing.lastRequestedAt) {
      const msSinceLast = now.getTime() - existing.lastRequestedAt.getTime();
      if (msSinceLast < input.cooldownMs) {
        return {
          ok: false,
          reason: "too_soon",
          retryAfterSeconds: Math.ceil((input.cooldownMs - msSinceLast) / 1000),
        };
      }
    }

    const requestsToday = existing.requestCountDate === input.todayUtc ? existing.requestCount : 0;
    if (requestsToday >= input.dailyCap) {
      return { ok: false, reason: "daily_cap" };
    }

    const [updated] = await tx
      .update(consentRecords)
      .set({
        parentContactId: input.parentContactId,
        status: "pending",
        tokenHash: input.tokenHash,
        tokenExpiresAt: input.tokenExpiresAt,
        usedAt: null,
        lastRequestedAt: now,
        requestCount: requestsToday + 1,
        requestCountDate: input.todayUtc,
      })
      .where(eq(consentRecords.id, existing.id))
      .returning();
    return { ok: true, record: updated };
  });
}

type ConfirmConsentInput = {
  consentRecordId: string;
  userId: string;
  legalDocumentIds: string[];
  legalDocumentVersions: Record<string, number>;
  withdrawTokenHash: string;
  actorIp: string | null;
  actorUserAgent: string | null;
};

// Flips the record to consented AND records the parent's acceptance of
// every currently published document in one transaction - a security audit
// found an earlier version did these as two separate, non-transactional
// steps, which could leave a partially-recorded consent (flipped to
// consented, but missing one or more legal_acceptances rows) if anything
// failed in between. The `status = pending` where-clause still guards
// against a reused/raced token, same as before: a null return means
// someone else (a concurrent request, or the token simply being stale)
// already resolved it, and the whole transaction - including any
// legal_acceptances inserts that would have followed - rolls back.
export async function confirmConsentAndRecordAcceptances(input: ConfirmConsentInput) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(consentRecords)
      .set({
        status: "consented",
        usedAt: now,
        actedAt: now,
        legalDocumentVersions: input.legalDocumentVersions,
        withdrawTokenHash: input.withdrawTokenHash,
        actorIp: input.actorIp,
        actorUserAgent: input.actorUserAgent,
      })
      .where(and(eq(consentRecords.id, input.consentRecordId), eq(consentRecords.status, "pending")))
      .returning();

    if (!updated) return null;

    if (input.legalDocumentIds.length > 0) {
      await tx.insert(legalAcceptances).values(
        input.legalDocumentIds.map((legalDocumentId) => ({
          userId: input.userId,
          legalDocumentId,
          acceptedBy: "parent" as const,
        })),
      );
    }

    return updated;
  });
}

// Only flips a row that's still `pending` (same reused-token guard as
// confirmConsentAndRecordAcceptances) - a null return means the token was
// already consumed by a concurrent request or is simply stale.
export async function declineConsentRecord(
  consentRecordId: string,
  meta: { actorIp: string | null; actorUserAgent: string | null },
) {
  const now = new Date();
  const [updated] = await db
    .update(consentRecords)
    .set({
      status: "refused",
      usedAt: now,
      actedAt: now,
      actorIp: meta.actorIp,
      actorUserAgent: meta.actorUserAgent,
    })
    .where(and(eq(consentRecords.id, consentRecordId), eq(consentRecords.status, "pending")))
    .returning();
  return updated ?? null;
}

export async function getConsentRecordByWithdrawTokenHash(withdrawTokenHash: string) {
  const [row] = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.withdrawTokenHash, withdrawTokenHash))
    .limit(1);
  return row ?? null;
}

// Only flips a row that's still `consented` - withdrawing something that
// was never consented (still pending, or already refused) doesn't make
// sense, and re-withdrawing an already-withdrawn row is handled by the
// caller as an idempotent no-op before this is ever called.
export async function withdrawConsentRecord(
  consentRecordId: string,
  meta: { actorIp: string | null; actorUserAgent: string | null },
) {
  const now = new Date();
  const [updated] = await db
    .update(consentRecords)
    .set({
      status: "withdrawn",
      actedAt: now,
      actorIp: meta.actorIp,
      actorUserAgent: meta.actorUserAgent,
    })
    .where(and(eq(consentRecords.id, consentRecordId), eq(consentRecords.status, "consented")))
    .returning();
  return updated ?? null;
}

export type ConsentReviewRow = {
  userId: string;
  firstName: string | null;
  lastInitial: string | null;
  status: ConsentRecordRow["status"];
  createdAt: Date;
  actedAt: Date | null;
  deletedAt: Date | null;
};

// Staff review list (consent.view) - deliberately never selects
// parent_contacts.name/email here. Those are only fetched (and logged) by
// getParentContactForReview below, one row at a time, on an explicit staff
// action - see docs/PRODUCT_SPEC.md's Onboarding & parental consent
// section: "every view of a parent's contact details is logged."
//
// Excludes deleted accounts by default - a deletion audit found they'd
// otherwise stay listed forever. `includeDeleted: true` shows them anyway
// (the admin page renders these as "Deleted, anonymised" and disables the
// reveal action for them - see revealParentContact in service.ts).
export async function listConsentRecordsForReview(
  limit: number,
  includeDeleted = false,
): Promise<ConsentReviewRow[]> {
  return db
    .select({
      userId: consentRecords.userId,
      firstName: users.firstName,
      lastInitial: users.lastInitial,
      status: consentRecords.status,
      createdAt: consentRecords.createdAt,
      actedAt: consentRecords.actedAt,
      deletedAt: users.deletedAt,
    })
    .from(consentRecords)
    .innerJoin(users, eq(users.id, consentRecords.userId))
    .where(includeDeleted ? undefined : isNull(users.deletedAt))
    .orderBy(consentRecords.createdAt)
    .limit(limit);
}

// The one place parent PII is read for a staff member - the caller
// (src/server/onboarding/service.ts) logs this call every time, per the
// non-negotiable rule that staff access to parent contact details is
// itself audited. The caller also refuses this for a deleted account
// before ever reaching here - see revealParentContact in service.ts.
export async function getParentContactForReview(userId: string) {
  return getParentContact(userId);
}

// --- Account-deletion scrub (src/server/onboarding/service.ts
// scrubConsentDataForDeletedUser) ---

// Anonymizes a parent's name/email in place - never deletes the row, since
// consent_records.parent_contact_id (onDelete: cascade) would take the
// consent_records row down with it, and that row is deliberately kept as
// durable proof of consent. The email is made unique per row (not a single
// shared placeholder) so anonymized rows can never look like "the same
// parent" to any future query keyed on email.
export async function anonymizeParentContact(parentContactId: string): Promise<void> {
  await db
    .update(parentContacts)
    .set({ name: "[deleted]", email: `deleted+${parentContactId}@anonymized.invalid` })
    .where(eq(parentContacts.id, parentContactId));
}

// Stores the HMAC computed from the about-to-be-anonymized parent email (see
// scrubConsentDataForDeletedUser) - null is a valid value (CONSENT_PII_HMAC_KEY
// unset, or no consent_records row exists yet for this user).
export async function setConsentRecordParentEmailHmac(
  userId: string,
  parentEmailHmac: string | null,
): Promise<void> {
  await db.update(consentRecords).set({ parentEmailHmac }).where(eq(consentRecords.userId, userId));
}

// --- Parent re-approval on legal-document changes (src/server/onboarding/
// service.ts notifyAffectedMinorsForReapproval / approveReapproval /
// declineReapproval / resendReapprovalRequests) ---

export type ReapprovalCandidate = {
  userId: string;
  dateOfBirth: string | null;
  firstName: string | null;
  parentContactId: string;
  parentEmail: string;
  parentName: string;
};

// Every non-deleted, already-consented account whose parent hasn't yet
// approved this specific legal_documents version - the audience for
// notifyAffectedMinorsForReapproval. isMinor(dateOfBirth) is deliberately
// filtered by the caller, not here, so a user who has since turned 18
// correctly falls out of the notification list - same pattern as every
// other parent/consent check being nested inside isMinor(...) in
// requireFullAccess.
export async function listCandidatesForReapproval(
  legalDocumentId: string,
): Promise<ReapprovalCandidate[]> {
  const rows = await db
    .select({
      userId: users.id,
      dateOfBirth: users.dateOfBirth,
      firstName: users.firstName,
      parentContactId: parentContacts.id,
      parentEmail: parentContacts.email,
      parentName: parentContacts.name,
      priorAcceptanceId: legalAcceptances.id,
    })
    .from(consentRecords)
    .innerJoin(users, eq(users.id, consentRecords.userId))
    .innerJoin(parentContacts, eq(parentContacts.id, consentRecords.parentContactId))
    .leftJoin(
      legalAcceptances,
      and(
        eq(legalAcceptances.userId, consentRecords.userId),
        eq(legalAcceptances.legalDocumentId, legalDocumentId),
        eq(legalAcceptances.acceptedBy, "parent"),
      ),
    )
    .where(and(eq(consentRecords.status, "consented"), isNull(users.deletedAt)));

  return rows
    .filter((r) => r.priorAcceptanceId === null)
    .map((r) => ({
      userId: r.userId,
      dateOfBirth: r.dateOfBirth,
      firstName: r.firstName,
      parentContactId: r.parentContactId,
      parentEmail: r.parentEmail,
      parentName: r.parentName,
    }));
}

export async function getReapprovalRequestByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(legalReapprovalRequests)
    .where(eq(legalReapprovalRequests.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

// Pending-only, used by resendReapprovalRequests to find what to resend for
// the signed-in user - an already approved/declined row is never resent.
export async function listPendingReapprovalRequestsForUser(userId: string) {
  return db
    .select()
    .from(legalReapprovalRequests)
    .where(
      and(eq(legalReapprovalRequests.userId, userId), eq(legalReapprovalRequests.status, "pending")),
    );
}

type ReapprovalRequestRow = typeof legalReapprovalRequests.$inferSelect;

type ClaimReapprovalRequestInput = {
  userId: string;
  legalDocumentId: string;
  parentContactId: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  todayUtc: string;
  cooldownMs: number;
  dailyCap: number;
};

export type ClaimReapprovalRequestResult =
  | { ok: true; record: ReapprovalRequestRow }
  | { ok: false; reason: "too_soon"; retryAfterSeconds: number }
  | { ok: false; reason: "daily_cap" }
  | { ok: false; reason: "already_resolved" };

// Same shape and same race-closing reasoning as claimConsentRequestSlot,
// scoped to (userId, legalDocumentId) instead of just userId (a minor can
// have more than one outstanding reapproval at once - see the unique index
// on legalReapprovalRequests). A first-ever call for a given pair always
// takes the "no existing row" branch and succeeds unconditionally - this is
// what lets notifyAffectedMinorsForReapproval's initial notification and
// resendReapprovalRequests' later resends share one function: the initial
// call always lands in that branch, a genuine resend lands in the
// cooldown/cap branch below. "already_resolved" covers the parent acting on
// the request in between a resend being queued and this claim running.
export async function claimReapprovalRequestSlot(
  input: ClaimReapprovalRequestInput,
): Promise<ClaimReapprovalRequestResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(legalReapprovalRequests)
      .where(
        and(
          eq(legalReapprovalRequests.userId, input.userId),
          eq(legalReapprovalRequests.legalDocumentId, input.legalDocumentId),
        ),
      )
      .for("update")
      .limit(1);

    const now = new Date();

    if (!existing) {
      try {
        const [created] = await tx
          .insert(legalReapprovalRequests)
          .values({
            userId: input.userId,
            legalDocumentId: input.legalDocumentId,
            parentContactId: input.parentContactId,
            status: "pending",
            tokenHash: input.tokenHash,
            tokenExpiresAt: input.tokenExpiresAt,
            lastRequestedAt: now,
            requestCount: 1,
            requestCountDate: input.todayUtc,
          })
          .returning();
        return { ok: true, record: created };
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, reason: "too_soon", retryAfterSeconds: 1 };
        }
        throw err;
      }
    }

    if (existing.status !== "pending") {
      return { ok: false, reason: "already_resolved" };
    }

    if (existing.lastRequestedAt) {
      const msSinceLast = now.getTime() - existing.lastRequestedAt.getTime();
      if (msSinceLast < input.cooldownMs) {
        return {
          ok: false,
          reason: "too_soon",
          retryAfterSeconds: Math.ceil((input.cooldownMs - msSinceLast) / 1000),
        };
      }
    }

    const requestsToday = existing.requestCountDate === input.todayUtc ? existing.requestCount : 0;
    if (requestsToday >= input.dailyCap) {
      return { ok: false, reason: "daily_cap" };
    }

    const [updated] = await tx
      .update(legalReapprovalRequests)
      .set({
        parentContactId: input.parentContactId,
        tokenHash: input.tokenHash,
        tokenExpiresAt: input.tokenExpiresAt,
        usedAt: null,
        lastRequestedAt: now,
        requestCount: requestsToday + 1,
        requestCountDate: input.todayUtc,
      })
      .where(eq(legalReapprovalRequests.id, existing.id))
      .returning();
    return { ok: true, record: updated };
  });
}

// Rotates the withdraw token on a minor's existing consent_records row -
// used when a reapproval-request email is (re)sent, so every email to an
// already-verified parent always carries a currently-valid withdraw link
// (CLAUDE.md rule 13), mirroring the rotation that already happens on
// initial consent in confirmConsentAndRecordAcceptances.
export async function setConsentRecordWithdrawTokenHash(
  userId: string,
  withdrawTokenHash: string,
): Promise<void> {
  await db
    .update(consentRecords)
    .set({ withdrawTokenHash })
    .where(eq(consentRecords.userId, userId));
}

type ApproveReapprovalInput = {
  requestId: string;
  userId: string;
  legalDocumentId: string;
  documentType: string;
  documentVersion: number;
  actorIp: string | null;
  actorUserAgent: string | null;
};

// Flips the reapproval row to `approved` (consuming its single-use token),
// records the parent's fresh acceptance of this exact document, and folds
// the version into consent_records.legal_document_versions - all in one
// transaction. A security audit found an earlier version did these as three
// separate, non-transactional writes: if the process died between them, the
// single-use token was already permanently burned (the guard is
// `status = pending`, so a burned token can never be resent or retried) but
// the parent's acceptance was never actually recorded, silently and
// permanently stranding that minor's account. Same fix shape as
// confirmConsentAndRecordAcceptances above. Returns null (whole transaction
// rolled back) if the token was already consumed by a concurrent request or
// is simply stale.
export async function approveReapprovalAndRecordAcceptance(input: ApproveReapprovalInput) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(legalReapprovalRequests)
      .set({
        status: "approved",
        usedAt: now,
        actedAt: now,
        actorIp: input.actorIp,
        actorUserAgent: input.actorUserAgent,
      })
      .where(
        and(eq(legalReapprovalRequests.id, input.requestId), eq(legalReapprovalRequests.status, "pending")),
      )
      .returning();

    if (!updated) return null;

    await tx.insert(legalAcceptances).values({
      userId: input.userId,
      legalDocumentId: input.legalDocumentId,
      acceptedBy: "parent",
    });

    // Shallow-merges { [type]: version } into legal_document_versions -
    // jsonb `||` overwrites only the matching top-level key, leaving every
    // other type's previously-recorded version untouched.
    await tx
      .update(consentRecords)
      .set({
        legalDocumentVersions: sql`coalesce(${consentRecords.legalDocumentVersions}, '{}'::jsonb) || ${JSON.stringify(
          { [input.documentType]: input.documentVersion },
        )}::jsonb`,
      })
      .where(eq(consentRecords.userId, input.userId));

    return updated;
  });
}

type DeclineReapprovalInput = {
  requestId: string;
  userId: string;
  actorIp: string | null;
  actorUserAgent: string | null;
};

// Flips the reapproval row to `declined` and, in the same transaction,
// revokes the parent's original consent entirely (status consented ->
// refused) - condition 5 of the re-approval design: declining is the same
// outcome as the original decline flow, not just "this one document stays
// unapproved". The consent_records update is guarded on `status =
// 'consented'` and unconditional otherwise (no separate read-then-write),
// so it's a safe no-op if the record somehow isn't `consented` anymore.
// Same non-transactional bug shape and fix as
// approveReapprovalAndRecordAcceptance above: a mid-flight crash used to be
// able to burn the token while leaving consent_records still `consented`,
// contradicting the "consent fully revoked" record the reapproval row and
// the parent's email both claim. Returns null (rolled back) if the token
// was already consumed or is stale.
export async function declineReapprovalAndRefuseConsent(input: DeclineReapprovalInput) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(legalReapprovalRequests)
      .set({
        status: "declined",
        usedAt: now,
        actedAt: now,
        actorIp: input.actorIp,
        actorUserAgent: input.actorUserAgent,
      })
      .where(
        and(eq(legalReapprovalRequests.id, input.requestId), eq(legalReapprovalRequests.status, "pending")),
      )
      .returning();

    if (!updated) return null;

    await tx
      .update(consentRecords)
      .set({
        status: "refused",
        actedAt: now,
        actorIp: input.actorIp,
        actorUserAgent: input.actorUserAgent,
      })
      .where(and(eq(consentRecords.userId, input.userId), eq(consentRecords.status, "consented")));

    return updated;
  });
}
