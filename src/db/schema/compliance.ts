import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { staffMembers } from "./staff";
import { users } from "./users";

export const legalDocumentTypeEnum = pgEnum("legal_document_type", [
  "terms",
  "privacy",
  "risk_disclosure",
]);
export const legalDocumentStatusEnum = pgEnum("legal_document_status", ["draft", "published"]);
export const legalAcceptedByEnum = pgEnum("legal_accepted_by", ["self", "parent"]);
// Kept as an enum with one value for now (rather than hardcoded) so a future
// SMS method is an enum addition, not a schema redesign - see
// docs/ROADMAP.md's pre-launch checklist.
export const consentMethodEnum = pgEnum("consent_method", ["email_link"]);
export const consentStatusEnum = pgEnum("consent_status", [
  "pending",
  "consented",
  "refused",
  "withdrawn",
]);

// Staff-editable, versioned Terms/Privacy/Risk-disclosure text. Only
// super_admin (permission `legal.manage`) can publish - see
// docs/PRODUCT_SPEC.md's Onboarding & parental consent section. `version`
// increments per `type`. v1 seeds these as DRAFT placeholders; real text
// is written after the outside legal review in docs/ROADMAP.md's
// pre-launch checklist.
export const legalDocuments = pgTable(
  "legal_documents",
  {
    ...idAndTimestamps(),
    type: legalDocumentTypeEnum("type").notNull(),
    version: integer("version").notNull(),
    content: jsonb("content").notNull().$type<{ en: string; hi: string; hx: string }>(),
    status: legalDocumentStatusEnum("status").default("draft").notNull(),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Set by scripts/seed-legal-documents.ts, never by the admin editor -
    // marks a version as pre-legal-review filler text so GET /api/v1/health
    // can surface it as a launch-blocking warning (see
    // src/app/api/v1/health/route.ts). A real staff-authored publish always
    // leaves this false.
    isPlaceholder: boolean("is_placeholder").default(false).notNull(),
    // Staff's explicit choice at publish time (src/server/legal/service.ts
    // publishLegalDocument) - never defaulted by the UI or the API, which
    // both require it to be passed. When true, every already-consented
    // minor's parent must re-approve this specific version before
    // requireFullAccess passes again for that minor - see
    // legalReapprovalRequests below. Always false for a placeholder
    // version, regardless of what's passed in (re-approving filler text
    // makes no sense).
    requiresParentReapproval: boolean("requires_parent_reapproval").default(false).notNull(),
  },
  (t) => [
    index("legal_documents_type_idx").on(t.type),
    uniqueIndex("legal_documents_type_version_idx").on(t.type, t.version),
  ],
).enableRLS();

// One row per acceptance of one legal_documents version. For a minor, full
// access requires BOTH an accepted_by:'parent' row (written when the parent
// presses "I consent" on the public consent page - see consentRecords
// below) AND an accepted_by:'self' row (the minor's own in-app "I accept",
// done once after parent consent). An adult only ever needs the 'self' row.
// requireFullAccess always checks against the currently *published* version
// per type, so an old acceptance never satisfies a newly published version.
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    legalDocumentId: uuid("legal_document_id")
      .notNull()
      .references(() => legalDocuments.id, { onDelete: "restrict" }),
    acceptedBy: legalAcceptedByEnum("accepted_by").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("legal_acceptances_user_id_idx").on(t.userId),
    index("legal_acceptances_legal_document_id_idx").on(t.legalDocumentId),
  ],
).enableRLS();

// A parent/guardian's contact info for one minor's account - email only in
// v1, no phone. One row per user (unique on user_id): changing the parent's
// email updates this same row via a fresh /parent-consent/request rather
// than creating a new one, so there's always exactly one current parent
// contact. The service layer enforces (not a DB constraint, since both are
// admin-tunable/derived, not hard invariants): the email can't equal the
// child's own users.email, and one email can back at most
// settings_kv.parent_email_max_children distinct verified users (default 5).
export const parentContacts = pgTable(
  "parent_contacts",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // D33 (docs/ARCHITECTURE.md): the parent's own opt-in for the weekly
    // report-card email, off by default. Settable only from the parent-
    // facing consent/reapproval pages (src/app/consent/actions.ts) - never
    // from the minor's own app, since who the parent relationship's data
    // flows to is the parent's decision, not the child's. Declining or
    // withdrawing consent always clears this back to false (see
    // src/server/onboarding/service.ts).
    weeklyReportOptIn: boolean("weekly_report_opt_in").default(false).notNull(),
    // Backs the "unsubscribe from just the weekly email" link every weekly
    // report email carries alongside the full withdraw-consent link (CLAUDE.md
    // rule 13) - rotated on every send (src/server/report-card/parent-email.ts),
    // same no-expiry lifetime as consent_records.withdraw_token_hash above.
    // Turning this off never touches consent_records - it only ever clears
    // weekly_report_opt_in.
    weeklyReportUnsubscribeTokenHash: text("weekly_report_unsubscribe_token_hash"),
  },
  (t) => [
    uniqueIndex("parent_contacts_user_id_idx").on(t.userId),
    index("parent_contacts_email_idx").on(t.email),
    uniqueIndex("parent_contacts_weekly_report_unsubscribe_token_hash_idx").on(
      t.weeklyReportUnsubscribeTokenHash,
    ),
  ],
).enableRLS();

// The current state of one user's parental-consent lifecycle - one row per
// user (unique on user_id), evolving in place (pending -> consented|refused,
// consented -> withdrawn); every transition is also written to
// activity_logs, which is the append-only history (this row is only the
// current state, per docs/DATA_MODEL.md's "balances are derived, ledger is
// truth" style pattern applied to consent). See docs/PRODUCT_SPEC.md's
// Onboarding & parental consent section for the full flow: a magic link is
// emailed to the parent; opening it (GET) never records anything (email
// scanners prefetch links); a separate POST records `consented` or
// `refused`. `token_hash`/`token_expires_at`/`used_at` back the single-use,
// 7-day, hashed consent token - resending regenerates these three fields on
// this same row rather than creating a duplicate. `withdraw_token_hash` (no
// expiry column - see service layer for its lifetime) backs the separate
// withdrawal link included in every email sent to an already-verified
// parent. `legal_document_versions` snapshots which version of each
// currently published doc type the parent saw at the moment they acted.
export const consentRecords = pgTable(
  "consent_records",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentContactId: uuid("parent_contact_id")
      .notNull()
      .references(() => parentContacts.id, { onDelete: "cascade" }),
    method: consentMethodEnum("method").default("email_link").notNull(),
    status: consentStatusEnum("status").default("pending").notNull(),
    legalDocumentVersions: jsonb("legal_document_versions").$type<
      Partial<Record<"terms" | "privacy" | "risk_disclosure", number>>
    >(),
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    withdrawTokenHash: text("withdraw_token_hash"),
    actedAt: timestamp("acted_at", { withTimezone: true }),
    actorIp: text("actor_ip"),
    actorUserAgent: text("actor_user_agent"),
    // DB-backed resend rate limiting (no Redis yet in this codebase - see
    // src/server/onboarding/service.ts): lastRequestedAt backs the 60s
    // cooldown; requestCount/requestCountDate back the daily cap, reset
    // whenever requestCountDate isn't today (UTC calendar day). The
    // per-parent-email cap sums requestCount across every consent_records
    // row joined to parent_contacts on email for today's date.
    lastRequestedAt: timestamp("last_requested_at", { withTimezone: true }),
    requestCount: integer("request_count").default(1).notNull(),
    requestCountDate: date("request_count_date"),
    // Set once, at account-deletion time (src/server/onboarding/service.ts
    // scrubConsentDataForDeletedUser), from the parent_contacts email that's
    // about to be anonymized - HMAC-SHA256 keyed by CONSENT_PII_HMAC_KEY, so
    // "was it this parent?" stays verifiable (compute the same HMAC over a
    // candidate email and compare) without retaining the raw email once the
    // account is deleted. Null for every account that hasn't been deleted.
    parentEmailHmac: text("parent_email_hmac"),
  },
  (t) => [
    uniqueIndex("consent_records_user_id_idx").on(t.userId),
    index("consent_records_parent_contact_id_idx").on(t.parentContactId),
    // Every public, unauthenticated confirm/decline/withdraw request looks
    // up a row by one of these two hashes - a security audit found neither
    // was indexed, so any request (including an invalid/guessed token) was
    // a full sequential scan, a free amplification vector as the table
    // grows. Unique also documents the "these must never collide"
    // invariant (Postgres allows multiple NULLs in a unique index, so this
    // is fine for withdraw_token_hash before a record is ever consented).
    uniqueIndex("consent_records_token_hash_idx").on(t.tokenHash),
    uniqueIndex("consent_records_withdraw_token_hash_idx").on(t.withdrawTokenHash),
  ],
).enableRLS();

export const legalReapprovalStatusEnum = pgEnum("legal_reapproval_status", [
  "pending",
  "approved",
  "declined",
]);

// One row per (minor, specific new legal_documents version that needs
// re-approval) - created when staff publishes a version with
// requires_parent_reapproval = true (src/server/legal/service.ts
// publishLegalDocument), for every already-consented, non-deleted minor.
// Deliberately separate from consentRecords (which represents the
// one-time blanket "may this minor use Finlamma at all" consent, one row
// per user) - this table can have several rows per minor over time (a
// re-approval per material legal-document change), and approving/declining
// one never touches the others. Same single-use/hashed-token/rate-limit
// shape as consentRecords' original request/confirm flow, reused per
// docs/PRODUCT_SPEC.md's Onboarding & parental consent section: "reuse
// existing rate limits and the resend flow."
export const legalReapprovalRequests = pgTable(
  "legal_reapproval_requests",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    legalDocumentId: uuid("legal_document_id")
      .notNull()
      .references(() => legalDocuments.id, { onDelete: "cascade" }),
    parentContactId: uuid("parent_contact_id")
      .notNull()
      .references(() => parentContacts.id, { onDelete: "cascade" }),
    status: legalReapprovalStatusEnum("status").default("pending").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    actedAt: timestamp("acted_at", { withTimezone: true }),
    actorIp: text("actor_ip"),
    actorUserAgent: text("actor_user_agent"),
    // Same DB-backed resend rate limiting as consentRecords - see its
    // comment above. Scoped per (user, legal_document) here rather than
    // just per user, since a minor could in principle have more than one
    // outstanding reapproval at once.
    lastRequestedAt: timestamp("last_requested_at", { withTimezone: true }),
    requestCount: integer("request_count").default(1).notNull(),
    requestCountDate: date("request_count_date"),
  },
  (t) => [
    uniqueIndex("legal_reapproval_requests_user_document_idx").on(t.userId, t.legalDocumentId),
    index("legal_reapproval_requests_legal_document_id_idx").on(t.legalDocumentId),
    // Same reasoning as consent_records' token indexes - every public,
    // unauthenticated approve/decline request looks this up by hash.
    uniqueIndex("legal_reapproval_requests_token_hash_idx").on(t.tokenHash),
  ],
).enableRLS();
