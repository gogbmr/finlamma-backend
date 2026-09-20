import { createHash, createHmac, randomBytes } from "node:crypto";
import type { ReactElement } from "react";
import { ParentConsentConfirmedEmail } from "@/emails/parent-consent-confirmed";
import { ParentConsentRequestEmail } from "@/emails/parent-consent-request";
import { ParentConsentWithdrawnEmail } from "@/emails/parent-consent-withdrawn";
import { ParentReapprovalRequestEmail } from "@/emails/parent-reapproval-request";
import { logActivity } from "@/lib/activity-log";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { logInternalError, type requestMeta } from "@/lib/http";
import { getSettingNumber } from "@/lib/settings";
import { getLegalDocumentById, insertAcceptance, listPublishedDocuments } from "@/server/legal/repo";
import { getLegalStatus } from "@/server/legal/service";
import {
  anonymizeParentContact,
  claimConsentRequestSlot,
  claimReapprovalRequestSlot,
  confirmConsentAndRecordAcceptances,
  countChildrenForParentEmail,
  declineConsentRecord,
  getConsentRecord,
  getConsentRecordByTokenHash,
  getConsentRecordByWithdrawTokenHash,
  getParentContact,
  getParentContactForReview,
  getReapprovalRequestByTokenHash,
  getUserFirstName,
  isUserDeleted,
  listCandidatesForReapproval,
  listConsentRecordsForReview,
  listPendingReapprovalRequestsForUser,
  markReapprovalApproved,
  markReapprovalDeclined,
  mergeConsentRecordLegalVersion,
  refuseConsentedRecord,
  setConsentRecordParentEmailHmac,
  setConsentRecordWithdrawTokenHash,
  setDateOfBirthOnce,
  sumRequestsTodayForParentEmail,
  upsertParentContact,
  withdrawConsentRecord,
} from "./repo";
import type { RequestParentConsentInput, SetDateOfBirthInput } from "./schemas";

const LEGAL_DOCUMENT_LABELS: Record<string, string> = {
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  risk_disclosure: "Risk Disclosure",
};

type RequestMeta = ReturnType<typeof requestMeta>;
type MeUser = { id: string; email: string | null; firstName: string | null; dateOfBirth: string | null };

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const DEFAULT_RESEND_DAILY_CAP = 5;
const DEFAULT_PARENT_EMAIL_MAX_CHILDREN = 5;

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Calendar-accurate age from a YYYY-MM-DD date of birth - not a 365.25-day
// approximation, since being off by even a day matters right around a
// birthday. Both sides are plain calendar dates (no timezone in
// `dateOfBirth`), so UTC field comparisons are the correct, unambiguous way
// to do this regardless of the server's local timezone.
export function isMinor(dateOfBirth: string): boolean {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age < 18;
}

// Sends via Resend, except outside the real production deployment with no
// verified Resend domain configured yet - there, it logs the link to the
// server console instead of throwing, so the consent flow stays testable
// locally and on a Vercel preview before Resend is set up. Production
// always sends for real (or fails closed) - never silently skips a
// legally-required email.
//
// Deliberately checks VERCEL_ENV, not NODE_ENV: `next build` always sets
// NODE_ENV=production, on a Vercel preview deployment too, so gating on
// NODE_ENV alone would make this fallback unreachable on preview - exactly
// where it's needed to test this flow before Resend is set up.
function isRealProductionDeployment(): boolean {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}

async function sendConsentEmailOrLog(params: {
  to: string;
  subject: string;
  react: ReactElement;
  devLogLabel: string;
  devLogDetail: string;
}) {
  const emailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  if (!emailConfigured && !isRealProductionDeployment()) {
    console.log(`[dev] Email not configured - ${params.devLogLabel}: ${params.devLogDetail}`);
    return;
  }
  await sendEmail({ to: params.to, subject: params.subject, react: params.react });
}

// Set-once: a second call always fails, even with the same value - see
// docs/PRODUCT_SPEC.md's Onboarding & parental consent section. Only staff
// can correct a mistake after this, with a logged reason (Checkpoint B/a
// later admin action, not built here).
export async function setDateOfBirth(user: MeUser, input: SetDateOfBirthInput, meta: RequestMeta) {
  if (user.dateOfBirth) {
    throw new AppError("CONFLICT", "Date of birth is already set - contact support to correct it");
  }

  const dob = new Date(`${input.dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) {
    throw new AppError("VALIDATION_FAILED", "Date of birth must be a valid date in the past");
  }

  const updated = await setDateOfBirthOnce(user.id, input.dateOfBirth);
  if (!updated) {
    throw new AppError("CONFLICT", "Date of birth is already set - contact support to correct it");
  }

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "onboarding.date_of_birth_set",
    targetType: "user",
    targetId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const minor = isMinor(input.dateOfBirth);
  return { dateOfBirth: input.dateOfBirth, isMinor: minor, requiresParentConsent: minor };
}

// Requests (or re-requests) parental consent. Every rejection here maps to
// a specific error code (see src/lib/errors.ts) the app can branch on -
// e.g. show a resend countdown for RESEND_TOO_SOON vs. a flat "try
// tomorrow" for RESEND_LIMIT_REACHED.
//
// The cooldown + per-user daily cap are enforced atomically by
// claimConsentRequestSlot (a locked transaction) - a security audit found
// an earlier check-then-write version of this could be raced by firing
// concurrent requests. The parent-email-wide checks below (child count,
// daily total) are still plain reads before the atomic claim - closing
// that race too would need serializable isolation across every account
// sharing an email, not just this user's row; tracked as a documented,
// lower-severity residual risk rather than fixed here.
export async function requestParentConsent(
  user: MeUser,
  input: RequestParentConsentInput,
  meta: RequestMeta,
) {
  if (!user.dateOfBirth) {
    throw new AppError("CONSENT_NOT_NEEDED", "Set your date of birth first");
  }
  if (!isMinor(user.dateOfBirth)) {
    throw new AppError("CONSENT_NOT_NEEDED", "Parental consent isn't required for this account");
  }

  // Normalized once, used everywhere below - an unnormalized email here
  // previously let the child-count and daily-total caps be bypassed by
  // varying casing (Parent@x.com vs parent@x.com), since virtually every
  // real mailbox treats those as the same address.
  const parentEmail = input.parentEmail.trim().toLowerCase();

  if (user.email && parentEmail === user.email.trim().toLowerCase()) {
    throw new AppError("PARENT_EMAIL_INVALID", "The parent's email can't be your own account email");
  }

  const existingConsent = await getConsentRecord(user.id);
  if (existingConsent?.status === "consented") {
    throw new AppError("CONSENT_NOT_NEEDED", "Parental consent has already been given");
  }

  const today = todayUtc();
  const dailyCap = await getSettingNumber("consent_resend_daily_cap", DEFAULT_RESEND_DAILY_CAP);

  const existingContact = await getParentContact(user.id);
  const isNewParentEmail = existingContact?.email !== parentEmail;
  if (isNewParentEmail) {
    const maxChildren = await getSettingNumber(
      "parent_email_max_children",
      DEFAULT_PARENT_EMAIL_MAX_CHILDREN,
    );
    const childCount = await countChildrenForParentEmail(parentEmail);
    if (childCount >= maxChildren) {
      throw new AppError(
        "PARENT_EMAIL_LIMIT_REACHED",
        "This parent email is already linked to the maximum number of accounts",
      );
    }
  }

  const requestsTodayForEmail = await sumRequestsTodayForParentEmail(parentEmail, today);
  if (requestsTodayForEmail >= dailyCap) {
    throw new AppError(
      "RESEND_LIMIT_REACHED",
      "Daily limit for consent emails reached for this parent email - try again tomorrow",
    );
  }

  const parentContact = await upsertParentContact(user.id, input.parentName, parentEmail);

  const token = generateToken();
  const claim = await claimConsentRequestSlot({
    userId: user.id,
    parentContactId: parentContact.id,
    tokenHash: hashToken(token),
    tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    todayUtc: today,
    cooldownMs: RESEND_COOLDOWN_MS,
    dailyCap,
  });

  if (!claim.ok) {
    if (claim.reason === "too_soon") {
      throw new AppError("RESEND_TOO_SOON", "Please wait a bit before requesting another email", {
        retryAfterSeconds: claim.retryAfterSeconds,
      });
    }
    throw new AppError(
      "RESEND_LIMIT_REACHED",
      "Daily limit for consent emails reached for this account - try again tomorrow",
    );
  }

  const childFirstName = user.firstName ?? "Your child";
  const consentUrl = `${env.APP_URL}/consent/confirm?token=${token}`;
  await sendConsentEmailOrLog({
    to: parentEmail,
    subject: `${childFirstName} wants to use Finlamma - we need your OK`,
    react: ParentConsentRequestEmail({ childFirstName, consentUrl }),
    devLogLabel: `parent consent link for user ${user.id}`,
    devLogDetail: consentUrl,
  });

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "consent.requested",
    targetType: "user",
    targetId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { status: "pending" as const, parentEmail };
}

export type ConsentRequestView =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "already_resolved" }
  | {
      state: "valid";
      childFirstName: string;
      documents: { type: string; version: number; content: { en: string; hi: string; hx: string } }[];
    };

// Read-only lookup for the public consent page's GET render - never
// records anything, since email security scanners prefetch links (see
// docs/PRODUCT_SPEC.md's Onboarding & parental consent section).
export async function getConsentRequestView(token: string): Promise<ConsentRequestView> {
  const record = await getConsentRecordByTokenHash(hashToken(token));
  if (!record) return { state: "invalid" };
  // A deleted account's consent_records row survives the soft-delete (see
  // isUserDeleted's comment in repo.ts) - treat its tokens as already
  // resolved rather than leaving them silently actionable.
  if (record.status !== "pending" || record.usedAt || (await isUserDeleted(record.userId))) {
    return { state: "already_resolved" };
  }
  if (record.tokenExpiresAt.getTime() < Date.now()) return { state: "expired" };

  const [childFirstName, publishedDocs] = await Promise.all([
    getUserFirstName(record.userId),
    listPublishedDocuments(),
  ]);

  return {
    state: "valid",
    childFirstName: childFirstName ?? "your child",
    documents: publishedDocs.map((d) => ({ type: d.type, version: d.version, content: d.content })),
  };
}

// The actual mutation behind the consent page's "I consent" POST. Guarded
// against a reused/raced token by confirmConsentAndRecordAcceptances'
// `status = pending` where-clause - a null result here means someone else
// (a concurrent request, or the token simply being stale) already resolved
// it. Flipping the record and recording every legal_acceptances row happens
// in one transaction (see repo.ts) - a security audit found an earlier
// version did these as separate steps, risking a consented-but-missing-
// acceptances state if something failed in between.
export async function confirmParentConsent(token: string, meta: RequestMeta) {
  const record = await getConsentRecordByTokenHash(hashToken(token));
  if (!record) throw new AppError("NOT_FOUND", "This consent link is invalid");
  if (record.status !== "pending" || record.usedAt || (await isUserDeleted(record.userId))) {
    throw new AppError("CONFLICT", "This consent link has already been used");
  }
  if (record.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("NOT_FOUND", "This consent link has expired - ask your child to request a new one");
  }

  const publishedDocs = await listPublishedDocuments();
  const legalDocumentVersions = Object.fromEntries(publishedDocs.map((d) => [d.type, d.version]));

  const withdrawToken = generateToken();
  const updated = await confirmConsentAndRecordAcceptances({
    consentRecordId: record.id,
    userId: record.userId,
    legalDocumentIds: publishedDocs.map((d) => d.id),
    legalDocumentVersions,
    withdrawTokenHash: hashToken(withdrawToken),
    actorIp: meta.ip,
    actorUserAgent: meta.userAgent,
  });
  if (!updated) {
    throw new AppError("CONFLICT", "This consent link has already been used");
  }

  await logActivity({
    actorType: "system",
    action: "consent.given",
    targetType: "user",
    targetId: record.userId,
    metadata: { actor: "parent", method: "email_link", legalDocumentVersions },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const [childFirstName, parentContact] = await Promise.all([
    getUserFirstName(record.userId),
    getParentContact(record.userId),
  ]);

  // Consent is already durably recorded above - a receipt-email delivery
  // failure must never surface as an error to the parent (their token is
  // single-use, so they'd have no way to retry). Best-effort only.
  if (parentContact) {
    const withdrawUrl = `${env.APP_URL}/consent/withdraw?token=${withdrawToken}`;
    try {
      await sendConsentEmailOrLog({
        to: parentContact.email,
        subject: "Your consent for Finlamma is recorded",
        react: ParentConsentConfirmedEmail({
          childFirstName: childFirstName ?? "your child",
          withdrawUrl,
        }),
        devLogLabel: `withdraw link for user ${record.userId}`,
        devLogDetail: withdrawUrl,
      });
    } catch (err) {
      logInternalError("consent.receipt_email_failed", err);
    }
  }

  return { childFirstName: childFirstName ?? "your child" };
}

// The "I do not consent" counterpart to confirmParentConsent - same
// single-use/expiry guards, no legal_acceptances rows, no receipt email
// (nothing to withdraw later since consent was never given).
export async function declineParentConsent(token: string, meta: RequestMeta) {
  const record = await getConsentRecordByTokenHash(hashToken(token));
  if (!record) throw new AppError("NOT_FOUND", "This consent link is invalid");
  if (record.status !== "pending" || record.usedAt || (await isUserDeleted(record.userId))) {
    throw new AppError("CONFLICT", "This consent link has already been used");
  }
  if (record.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("NOT_FOUND", "This consent link has expired - ask your child to request a new one");
  }

  const updated = await declineConsentRecord(record.id, {
    actorIp: meta.ip,
    actorUserAgent: meta.userAgent,
  });
  if (!updated) {
    throw new AppError("CONFLICT", "This consent link has already been used");
  }

  await logActivity({
    actorType: "system",
    action: "consent.refused",
    targetType: "user",
    targetId: record.userId,
    metadata: { actor: "parent", method: "email_link" },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const childFirstName = await getUserFirstName(record.userId);
  return { childFirstName: childFirstName ?? "your child" };
}

export type WithdrawRequestView =
  | { state: "invalid" }
  | { state: "already_withdrawn" }
  | { state: "not_applicable" }
  | { state: "valid"; childFirstName: string };

// Read-only, same GET-must-be-side-effect-free rule as
// getConsentRequestView. "not_applicable" covers a withdraw token whose
// consent_records row somehow isn't in the `consented` state (e.g. it was
// never actually consented) - shouldn't happen in normal use since a
// withdraw token is only ever minted by confirmParentConsent. A deleted
// account is treated the same as already-withdrawn (see isUserDeleted's
// comment in repo.ts), not as a distinct error - the account being gone
// isn't something this page should reveal to whoever holds the link.
export async function getWithdrawRequestView(token: string): Promise<WithdrawRequestView> {
  const record = await getConsentRecordByWithdrawTokenHash(hashToken(token));
  if (!record) return { state: "invalid" };
  if (record.status === "withdrawn" || (await isUserDeleted(record.userId))) {
    return { state: "already_withdrawn" };
  }
  if (record.status !== "consented") return { state: "not_applicable" };

  const childFirstName = await getUserFirstName(record.userId);
  return { state: "valid", childFirstName: childFirstName ?? "your child" };
}

// Withdrawing is idempotent by design (unlike consent/decline, which are
// strictly single-use): a parent re-clicking an old withdrawal email isn't
// an attack or a race, just someone re-confirming what they already did, so
// it's treated as a normal success rather than an error. requireFullAccess
// picks up the access change immediately - it already treats any non-
// 'consented' status as blocking, so there's no separate "revoke access"
// step needed here.
export async function withdrawParentConsent(token: string, meta: RequestMeta) {
  const record = await getConsentRecordByWithdrawTokenHash(hashToken(token));
  if (!record) throw new AppError("NOT_FOUND", "This withdrawal link is invalid");

  // Same "treat a deleted account's token as already resolved, don't
  // reveal why" reasoning as getWithdrawRequestView.
  if (record.status === "withdrawn" || (await isUserDeleted(record.userId))) {
    const childFirstName = await getUserFirstName(record.userId);
    return { childFirstName: childFirstName ?? "your child", alreadyWithdrawn: true };
  }
  if (record.status !== "consented") {
    throw new AppError("CONFLICT", "There's no active consent to withdraw for this request");
  }

  const updated = await withdrawConsentRecord(record.id, {
    actorIp: meta.ip,
    actorUserAgent: meta.userAgent,
  });
  if (!updated) {
    // A security audit found this previously threw CONFLICT here, which
    // broke the "idempotent" promise above: since record.status was just
    // confirmed 'consented' a moment ago, the only way the atomic update
    // can still miss is a concurrent withdraw request winning the race in
    // between - i.e. exactly the already-withdrawn case, not a real
    // conflict. Report it the same way.
    const childFirstName = await getUserFirstName(record.userId);
    return { childFirstName: childFirstName ?? "your child", alreadyWithdrawn: true };
  }

  await logActivity({
    actorType: "system",
    action: "consent.withdrawn",
    targetType: "user",
    targetId: record.userId,
    metadata: { actor: "parent", method: "email_link" },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const [childFirstName, parentContact] = await Promise.all([
    getUserFirstName(record.userId),
    getParentContact(record.userId),
  ]);

  // Withdrawal is already durably recorded above - same best-effort
  // reasoning as the consent receipt email in confirmParentConsent. Only
  // sent on a genuine new withdrawal, never on the idempotent
  // already-withdrawn path, so re-clicking an old link doesn't re-send it.
  if (parentContact) {
    try {
      await sendConsentEmailOrLog({
        to: parentContact.email,
        subject: "Your consent for Finlamma has been withdrawn",
        react: ParentConsentWithdrawnEmail({ childFirstName: childFirstName ?? "your child" }),
        devLogLabel: `withdrawal confirmed for user ${record.userId}`,
        devLogDetail: "(no link - confirmation only)",
      });
    } catch (err) {
      logInternalError("consent.withdrawal_email_failed", err);
    }
  }

  return { childFirstName: childFirstName ?? "your child", alreadyWithdrawn: false };
}

// --- Account-deletion scrub (called from src/server/users/service.ts,
// both self-deletion and the Clerk user.deleted webhook, so it runs no
// matter which side triggers the deletion) ---
//
// A deletion audit found this data was never touched by account deletion:
// the parent's real name/email in parent_contacts, and the minor's real
// date of birth (now handled directly in anonymizeUserFromClerk). This is
// the parent_contacts + consent_records half.
export async function scrubConsentDataForDeletedUser(
  userId: string,
  meta: RequestMeta,
): Promise<void> {
  const parentContact = await getParentContact(userId);
  if (!parentContact) return; // adult account, or a minor who never requested consent

  const hmacKey = env.CONSENT_PII_HMAC_KEY;
  const parentEmailHmac = hmacKey
    ? createHmac("sha256", hmacKey).update(parentContact.email).digest("hex")
    : null;
  if (!hmacKey) {
    logInternalError(
      "consent.scrub_missing_hmac_key",
      new Error(`CONSENT_PII_HMAC_KEY not configured - deleting user ${userId} without HMAC proof`),
    );
  }
  await setConsentRecordParentEmailHmac(userId, parentEmailHmac);

  // countChildrenForParentEmail excludes deleted accounts, and this user's
  // own deletedAt is already set by the time this runs (see
  // src/server/users/service.ts) - so this naturally counts *other* active
  // children only, with no separate "exclude self" parameter needed.
  const otherActiveChildren = await countChildrenForParentEmail(parentContact.email);
  const anonymized = otherActiveChildren === 0;
  if (anonymized) {
    // Only erase the parent's contact info once no other current child
    // depends on it - if the same email still backs another active child,
    // it's still a live, legitimate contact for the platform (that
    // sibling's own separate parent_contacts row already holds the same
    // information anyway, so erasing this one row would achieve nothing).
    await anonymizeParentContact(parentContact.id);
  }

  await logActivity({
    actorType: "user",
    actorId: userId,
    action: "consent.data_scrubbed_on_deletion",
    targetType: "user",
    targetId: userId,
    metadata: { parentContactAnonymized: anonymized, hmacStored: Boolean(parentEmailHmac) },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// --- Staff (admin, consent.view - read-only) ---

// Excludes deleted accounts by default - see listConsentRecordsForReview.
export async function getConsentReviewList(limit = 100, includeDeleted = false) {
  return listConsentRecordsForReview(limit, includeDeleted);
}

// The one path that reveals a parent's name/email to staff - always logs
// the reveal itself (actor = the staff member, target = the child account),
// per the non-negotiable rule that staff access to parent contact details
// is itself audited. Never called from a list render, only from an
// explicit staff action (see the admin consent-review page). Refuses for a
// deleted account - even if some PII survived (parentContactAnonymized was
// false because a sibling is still active), a deleted child's own contact
// details are never staff-revealable again.
export async function revealParentContact(
  actor: { id: string },
  userId: string,
  meta: RequestMeta,
) {
  if (await isUserDeleted(userId)) {
    throw new AppError("NOT_FOUND", "This account has been deleted - contact details are no longer available");
  }

  const contact = await getParentContactForReview(userId);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "consent.parent_contact_viewed",
    targetType: "user",
    targetId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return contact;
}

// The access gate every XP/VM/trading/social endpoint from Phase 2b onward
// must call (see docs/ROADMAP.md Phase 2a). No date of birth yet counts as
// "onboarding incomplete", same bucket as an unresolved minor consent -
// both mean "limited to onboarding, Settings and legal pages only".
export async function requireFullAccess(user: MeUser): Promise<void> {
  if (!user.dateOfBirth) {
    throw new AppError("FORBIDDEN", "Complete onboarding before using this feature");
  }

  const minor = isMinor(user.dateOfBirth);

  if (minor) {
    const consent = await getConsentRecord(user.id);
    if (consent?.status !== "consented") {
      throw new AppError("FORBIDDEN", "Parental consent is required before using this feature");
    }
  }

  const legalStatus = await getLegalStatus(user);
  if (!legalStatus.allAccepted) {
    throw new AppError(
      "FORBIDDEN",
      "Accept the current Terms, Privacy and Risk-disclosure before using this feature",
    );
  }

  // A minor who already has full consent can still be knocked back into
  // limited access by a later material legal-document change - same
  // limited-access bucket as first-time consent, but a distinct error code
  // so the app can tell the two apart (see src/lib/errors.ts).
  if (minor && !legalStatus.allParentApproved) {
    throw new AppError(
      "PARENT_REAPPROVAL_REQUIRED",
      "Your parent needs to approve the updated Terms, Privacy or Risk-disclosure before you can continue",
    );
  }
}

// --- Parent re-approval on legal-document changes ---

async function sendReapprovalEmail(params: {
  userId: string;
  parentEmail: string;
  childFirstName: string;
  documentLabel: string;
  reapprovalUrl: string;
  withdrawUrl: string;
}) {
  await sendConsentEmailOrLog({
    to: params.parentEmail,
    subject: `We updated our ${params.documentLabel} - please review it for ${params.childFirstName}`,
    react: ParentReapprovalRequestEmail({
      childFirstName: params.childFirstName,
      documentLabel: params.documentLabel,
      reapprovalUrl: params.reapprovalUrl,
      withdrawUrl: params.withdrawUrl,
    }),
    devLogLabel: `parent reapproval link for user ${params.userId}`,
    devLogDetail: params.reapprovalUrl,
  });
}

// Called from the admin Legal editor's publish Server Action (never from
// here directly - the onboarding domain can't be called from legal/service.ts
// without creating a circular import, since legal already has no dependency
// on onboarding and onboarding already depends on legal) right after a
// version is published with requires_parent_reapproval = true. Every
// already-consented, non-deleted minor without a `parent` acceptance row for
// this exact legal_document_id gets a fresh 7-day single-use reapproval link
// plus a rotated withdraw link, reusing the same cooldown/daily-cap settings
// as the original consent-request flow (docs/PRODUCT_SPEC.md: "reuse
// existing rate limits and the resend flow").
export async function notifyAffectedMinorsForReapproval(
  legalDocumentId: string,
  meta: RequestMeta,
): Promise<{ notified: number }> {
  const doc = await getLegalDocumentById(legalDocumentId);
  if (!doc) throw new AppError("NOT_FOUND", "Legal document not found");

  const candidates = await listCandidatesForReapproval(legalDocumentId);
  const minors = candidates.filter((c) => c.dateOfBirth && isMinor(c.dateOfBirth));

  const dailyCap = await getSettingNumber("consent_resend_daily_cap", DEFAULT_RESEND_DAILY_CAP);
  const today = todayUtc();
  const documentLabel = LEGAL_DOCUMENT_LABELS[doc.type] ?? doc.type;

  let notified = 0;
  for (const candidate of minors) {
    const token = generateToken();
    const claim = await claimReapprovalRequestSlot({
      userId: candidate.userId,
      legalDocumentId,
      parentContactId: candidate.parentContactId,
      tokenHash: hashToken(token),
      tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      todayUtc: today,
      cooldownMs: RESEND_COOLDOWN_MS,
      dailyCap,
    });
    if (!claim.ok) {
      // A first-ever call for a brand-new legal_document_id always takes
      // the unconditional "no existing row" branch (see
      // claimReapprovalRequestSlot) - this shouldn't happen, but one
      // unexpected failure must never abort notifying the rest of the batch.
      logInternalError(
        "legal.reapproval_notify_claim_failed",
        new Error(`claimReapprovalRequestSlot failed for a candidate: ${claim.reason}`),
      );
      continue;
    }

    const withdrawToken = generateToken();
    await setConsentRecordWithdrawTokenHash(candidate.userId, hashToken(withdrawToken));

    const childFirstName = candidate.firstName ?? "Your child";
    await sendReapprovalEmail({
      userId: candidate.userId,
      parentEmail: candidate.parentEmail,
      childFirstName,
      documentLabel,
      reapprovalUrl: `${env.APP_URL}/consent/reapprove?token=${token}`,
      withdrawUrl: `${env.APP_URL}/consent/withdraw?token=${withdrawToken}`,
    });

    await logActivity({
      actorType: "system",
      action: "legal.reapproval_requested",
      targetType: "user",
      targetId: candidate.userId,
      metadata: { legalDocumentId, type: doc.type, version: doc.version },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    notified += 1;
  }

  return { notified };
}

export type ReapprovalRequestView =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "already_resolved" }
  | {
      state: "valid";
      childFirstName: string;
      documentType: string;
      documentVersion: number;
      documentContent: { en: string; hi: string; hx: string };
    };

// Read-only lookup for the public reapproval page's GET render - same
// GET-must-be-side-effect-free rule as getConsentRequestView.
export async function getReapprovalRequestView(token: string): Promise<ReapprovalRequestView> {
  const record = await getReapprovalRequestByTokenHash(hashToken(token));
  if (!record) return { state: "invalid" };
  if (record.status !== "pending" || record.usedAt || (await isUserDeleted(record.userId))) {
    return { state: "already_resolved" };
  }
  if (record.tokenExpiresAt.getTime() < Date.now()) return { state: "expired" };

  const [childFirstName, doc] = await Promise.all([
    getUserFirstName(record.userId),
    getLegalDocumentById(record.legalDocumentId),
  ]);
  if (!doc) return { state: "invalid" }; // shouldn't happen - FK guarantees the row exists

  return {
    state: "valid",
    childFirstName: childFirstName ?? "your child",
    documentType: doc.type,
    documentVersion: doc.version,
    documentContent: doc.content,
  };
}

// The actual mutation behind the reapproval page's "I approve" POST -
// records the parent's fresh acceptance of this exact document version and
// folds its version into consent_records.legal_document_versions (condition
// 6: "record which legal versions the parent approved on the consent
// record"), so requireFullAccess's allParentApproved check passes again.
export async function approveReapproval(token: string, meta: RequestMeta) {
  const record = await getReapprovalRequestByTokenHash(hashToken(token));
  if (!record) throw new AppError("NOT_FOUND", "This link is invalid");
  if (record.status !== "pending" || record.usedAt || (await isUserDeleted(record.userId))) {
    throw new AppError("CONFLICT", "This link has already been used");
  }
  if (record.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("NOT_FOUND", "This link has expired - ask your child to request a new one");
  }

  const doc = await getLegalDocumentById(record.legalDocumentId);
  if (!doc) throw new AppError("NOT_FOUND", "This link is invalid");

  const updated = await markReapprovalApproved(record.id, {
    actorIp: meta.ip,
    actorUserAgent: meta.userAgent,
  });
  if (!updated) throw new AppError("CONFLICT", "This link has already been used");

  await insertAcceptance(record.userId, record.legalDocumentId, "parent");
  await mergeConsentRecordLegalVersion(record.userId, doc.type, doc.version);

  await logActivity({
    actorType: "system",
    action: "legal.reapproval_approved",
    targetType: "user",
    targetId: record.userId,
    metadata: { legalDocumentId: doc.id, type: doc.type, version: doc.version },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const childFirstName = await getUserFirstName(record.userId);
  return { childFirstName: childFirstName ?? "your child" };
}

// The reapproval page's "I do not approve" counterpart - condition 5: same
// outcome as the existing decline flow, which means the parent's *original*
// consent is revoked entirely (refuseConsentedRecord), not just this one
// document version staying unapproved. requireFullAccess already blocks a
// minor on any non-'consented' status, so this alone returns the account to
// limited access.
export async function declineReapproval(token: string, meta: RequestMeta) {
  const record = await getReapprovalRequestByTokenHash(hashToken(token));
  if (!record) throw new AppError("NOT_FOUND", "This link is invalid");
  if (record.status !== "pending" || record.usedAt || (await isUserDeleted(record.userId))) {
    throw new AppError("CONFLICT", "This link has already been used");
  }
  if (record.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("NOT_FOUND", "This link has expired - ask your child to request a new one");
  }

  const updated = await markReapprovalDeclined(record.id, {
    actorIp: meta.ip,
    actorUserAgent: meta.userAgent,
  });
  if (!updated) throw new AppError("CONFLICT", "This link has already been used");

  const consentRecord = await getConsentRecord(record.userId);
  if (consentRecord && consentRecord.status === "consented") {
    await refuseConsentedRecord(consentRecord.id, {
      actorIp: meta.ip,
      actorUserAgent: meta.userAgent,
    });
  }

  await logActivity({
    actorType: "system",
    action: "legal.reapproval_declined",
    targetType: "user",
    targetId: record.userId,
    metadata: { legalDocumentId: record.legalDocumentId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const childFirstName = await getUserFirstName(record.userId);
  return { childFirstName: childFirstName ?? "your child" };
}

// Authenticated endpoint (POST /api/v1/me/legal/reapproval/resend) for the
// signed-in minor to ask for their pending reapproval email(s) again -
// reuses claimReapprovalRequestSlot's cooldown/daily-cap branch, same as
// requestParentConsent's resend path. In the rare case of more than one
// simultaneous pending reapproval, hitting a cooldown/cap on one aborts the
// whole call rather than partially resending - acceptable given how rare
// that overlap is in practice.
export async function resendReapprovalRequests(user: MeUser, meta: RequestMeta) {
  const pending = await listPendingReapprovalRequestsForUser(user.id);
  if (pending.length === 0) {
    throw new AppError("CONSENT_NOT_NEEDED", "There's no pending re-approval for this account");
  }

  const parentContact = await getParentContact(user.id);
  if (!parentContact) {
    throw new AppError("CONSENT_NOT_NEEDED", "There's no pending re-approval for this account");
  }

  const dailyCap = await getSettingNumber("consent_resend_daily_cap", DEFAULT_RESEND_DAILY_CAP);
  const today = todayUtc();
  const childFirstName = user.firstName ?? "Your child";

  let resent = 0;
  for (const request of pending) {
    const doc = await getLegalDocumentById(request.legalDocumentId);
    if (!doc) continue;

    const token = generateToken();
    const claim = await claimReapprovalRequestSlot({
      userId: user.id,
      legalDocumentId: request.legalDocumentId,
      parentContactId: parentContact.id,
      tokenHash: hashToken(token),
      tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      todayUtc: today,
      cooldownMs: RESEND_COOLDOWN_MS,
      dailyCap,
    });
    if (!claim.ok) {
      if (claim.reason === "too_soon") {
        throw new AppError("RESEND_TOO_SOON", "Please wait a bit before requesting another email", {
          retryAfterSeconds: claim.retryAfterSeconds,
        });
      }
      if (claim.reason === "daily_cap") {
        throw new AppError(
          "RESEND_LIMIT_REACHED",
          "Daily limit for re-approval emails reached - try again tomorrow",
        );
      }
      continue; // already_resolved - the parent acted since this was listed
    }

    const withdrawToken = generateToken();
    await setConsentRecordWithdrawTokenHash(user.id, hashToken(withdrawToken));

    await sendReapprovalEmail({
      userId: user.id,
      parentEmail: parentContact.email,
      childFirstName,
      documentLabel: LEGAL_DOCUMENT_LABELS[doc.type] ?? doc.type,
      reapprovalUrl: `${env.APP_URL}/consent/reapprove?token=${token}`,
      withdrawUrl: `${env.APP_URL}/consent/withdraw?token=${withdrawToken}`,
    });

    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "legal.reapproval_resent",
      targetType: "user",
      targetId: user.id,
      metadata: { legalDocumentId: request.legalDocumentId, type: doc.type, version: doc.version },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    resent += 1;
  }

  return { resent };
}
