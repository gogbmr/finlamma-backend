# Status

## 2026-09-23 — Decided: keep the single shared database for now (dev/preview/production), not a separate dev project

Recorded in full as `docs/ARCHITECTURE.md` decision D27 - summary here for the dated record.

Considered splitting off a dedicated dev database once Phase 3 Checkpoint 2 started writing to
the append-only `xp_events`/`vmoney_ledger` tables, since local/preview test credits permanently
accumulate there with no delete path. **Decided against it for now**: there are no real users
yet, so a dedicated dev database isn't buying real protection today - it would just be earlier
infrastructure than the risk currently justifies.

**Consequences (also in D27, restated here since this is the entry someone will find first):**
- `xp_events`/`vmoney_ledger` (and later Phase 4's `orders`/`holdings`) cannot be cleaned up -
  only reversed with a new row, which still leaves the original test row in the table forever.
- **Blocking pre-launch item added to `docs/ROADMAP.md`** (above the existing "separate dev
  database" item): the production database must be recreated from migrations + seeds - fresh
  Supabase project or a full reset - before real users sign up, so day-one ledgers are clean.
- CLAUDE.md rule 8 (destructive migrations must wait for production deploy) stays exactly as
  critical as before - nothing about this decision relaxes it, since every migration still lands
  on the one real database immediately.
- **Test learners created against this shared database from here on must be recorded here**,
  by email or `clerkUserId`, at the time they're created - not because they can be cleaned up
  (they can't, per the point above), but so they're identifiable rather than mistaken for real
  activity when the recreate actually happens.

**Test learners recorded so far: none.** No test learner (user) rows have been created against
the shared database during Phase 3a work (Checkpoints 1-2 only touched schema/seed/settings rows
- `reward_rules`, `settings_kv`, the `economy.manage` permission grant - which are real
launch-intended data, not test learners). This section gets a new bullet the first time one is
created.

## 2026-09-22 — Phase 2b merged to `main` and verified in production. Next: Phase 3a.

`phase-2b-content` merged into `main` via merge commit `3b0d147` (21 commits, kept the branch),
after `/phase-audit 2b` below passed with its one Medium finding fixed pre-merge.

**Production, verified post-merge against `https://finlamma-backend-rho.vercel.app`:**
- `GET /api/v1/health`: `version` is `3b0d147`, matching the merge commit exactly. `status`,
  `database`, `migrations`, `clerkKeys`, `storage`, `consentPiiHmacKey` all `ok`.
  `tradingUnlockWorldMissing: false`. `worldsMissingBossQuiz` still lists all 7 seeded worlds -
  this is the pre-existing pre-launch blocker tracked below (2026-09-21 entry), not a merge
  regression; nothing in Phase 2b was expected to close it.
- `legalDocuments: "placeholder"` is expected (real text pending outside legal review) - unrelated
  to this merge, tracked on the pre-launch checklist.

**Phase 2b is fully verified end to end and closed.** Phase 3 is split into two branches per the
`/phase-kickoff 3` plan: **Phase 3a** (rate limiting, core XP/VM ledger, story/doubt-zone
completion, streaks, XP/level/VM stat endpoints) merges first and gets its own `/phase-audit`;
**Phase 3b** (badges, rewards, certificates, weekly report card) starts on a fresh branch only
after 3a merges to `main`. Next up: Phase 3a.

## 2026-09-22 — `/phase-audit 2b`: PASS, 1 Medium security finding fixed before merge

Full audit of Phase 2b (`docs/ROADMAP.md`'s 7 ticked items + all 42 `docs/FEATURE_MAP.md` rows
tagged phase `2b`) before merging `phase-2b-content` to `main`.

**Code health**: `pnpm typecheck`/`pnpm lint`/`pnpm test -- --run` (758 tests)/`pnpm build` all
clean. Contract (`openapi/openapi.json`, `docs/API_ENDPOINTS.md`) regenerated and diffed against
committed versions - no drift.

**Database**: all 21 migrations applied and match `drizzle/meta/_journal.json`; live schema
matches `src/db/schema/*` exactly for every Phase 2b table; RLS enabled with zero policies on all
20 `public` tables (by design, CLAUDE.md rule 6); Supabase advisors - zero at `warn` or above (8
unindexed FKs and 15 unused indexes, both `INFO`, added to the pre-launch checklist below).

**FEATURE_MAP.md drift found and fixed**: every one of the 42 Phase-2b-tagged rows still read
"Not built" despite most being implemented and tested throughout the phase - pure documentation
drift, not a functional gap. Traced each row to real code: **25 rows → Built**, **5 rows
(LF-24/25/26/27/31, the lesson report card's letter-grade/hero-stats/bar-chart/XP-breakdown
presentation) reassigned from phase `2b/3` to `3`** with status "Partial — aggregation in Phase
3" (the underlying `quiz_attempts`/`question_answers` data exists, but no endpoint aggregates it
into that shape yet), **12 rows correctly remain "Not built"** (genuine mobile-app-only UI or
depend on Phase 3 tables that don't exist yet - `xp_events`, `streaks`, `certificates`).

**Security audit** (`security-auditor` subagent, read-only scope: mentors/worlds/lessons/
questions/quiz-attempts domains). **1 Medium, fixed before merge**: `uploadMentorArt`/
`uploadWorldArt` never checked the content's status, unlike every other live-content edit path -
a `content_uploader` (holds `.manage`, no `.publish`) could silently replace a **published**
mentor/world's art, instantly visible to every learner, with no review step. D20 deliberately
requires `.publish`-tier trust for any direct edit to live content; this path was missed. Fixed:
`uploadMentorArt`/`uploadWorldArt` now require `mentor.publish`/`world.publish` when the target
is published (`mentor.manage`/`world.manage` still suffices for a draft) - checked authoritatively
in the service layer (`src/server/{mentors,worlds}/service.ts`), not just the action layer. Art
uploads also now get a unique key per upload (`randomUUID()`-suffixed, not a fixed per-entity
path) instead of overwriting the previous object in place, and the activity log records both the
previous and new key, so a bad upload to live content can be reverted without needing the
original file again. The same fix extended to `reorderWorld`: reordering a **published** world
now also requires `world.publish` (a draft reorder still only needs `world.manage`), since a
published world's position drives D25's `tradingUnlockAfterWorldPosition` gate. New shared
`requireStaffAny(permissions)` helper added to `src/lib/auth.ts` for this "which permission
applies depends on data the caller doesn't know yet" shape. 21 new/updated tests cover both
fixes (uploader rejected on published content, publisher allowed, draft uploads unchanged, for
both mentors and worlds, plus the equivalent reorder-tier tests).

**2 Low findings, tracked, not fixed now**: no rate limiting on the quiz serve/answer endpoints
(added as the first item of Phase 3 in `docs/ROADMAP.md` - low impact today since XP is
preview-only and each step grades once idempotently, but needed before Phase 3 credits real XP);
`world.manage` alone can still reorder a *draft* world's position relative to published ones in
some edge cases - noted for a second look once Phase 4 wires up `isTradingUnlocked()` for real.

**Production checks** (`https://finlamma-backend-rho.vercel.app`, version `a1bced1` = `origin/main`
HEAD): health `ok`, every authenticated endpoint in scope returns 401 without a token, both Clerk
webhooks reject unsigned requests with 400, `/admin` redirects a signed-out visitor to sign-in.
Confirms the known `/admin/mentors`/`GET /api/v1/mentors` production breakage below is still the
only issue, isolated to mentors (worlds/lessons/questions were never deployed to `main` at all).

**Cosmetic fix**: `metadataBase` now set from `env.APP_URL` in the root layout, silencing the
`pnpm build` warning about OG/Twitter image resolution falling back to `localhost:3000`.

**Result: PASS.** The one Medium finding was fixed before this entry; no Critical/High findings.
Ready to merge once the founder finishes preview testing.

## 2026-09-22 — Known, temporary production issue: `/admin/mentors` and `GET /api/v1/mentors` are broken, resolved by the Phase 2b merge

D25 (`docs/ARCHITECTURE.md`) dropped `mentors.world_range_start`/`world_range_end` on
`phase-2b-content` (migration `drizzle/0020_cynical_nomad.sql`, applied to the shared database).
**Preview and production share one database**, and `main` (still at `a1bced1`) has code
(`src/server/mentors/repo.ts`, `schemas.ts`) that still selects and inserts those columns - every
mentor query Drizzle generates on `main` now references columns that no longer exist.

**Confirmed broken in production right now:**
- `GET /api/v1/mentors` and `GET /api/v1/mentors/{key}` - will 500 past the auth gate (verified
  the auth gate itself still works: an unauthenticated request correctly returns
  `401 UNAUTHENTICATED`, but no valid session token was available to observe the failure past it;
  confirmed instead by reading `main`'s `repo.ts`, which still does `db.select().from(mentors)`
  including the dropped columns).
- `/admin/mentors` - `getMentorEditorData()` → `listAllMentors()` throws uncaught, so the page
  fails to render.

**Nothing else is affected** - `main` doesn't have the `worlds` domain at all yet, so
`GET /api/v1/worlds` and everything else are untouched. `GET /api/v1/health` still reports
`status: ok`/`database: ok` in production, which is not evidence mentors works - health never
queries the `mentors` table.

**Accepted, not fixed now** (founder decision, 2026-09-22): the founder is the only staff user
and tests on the preview deployment, not production `/admin/mentors`, so this is low-cost to
leave until the Phase 2b merge - re-adding the columns temporarily was considered and declined.
**Resolved automatically once `phase-2b-content` merges to `main`** (main's mentor code no longer
references the dropped columns from that point on).

**Post-merge checklist addition**: verify `/admin/mentors` and `GET /api/v1/mentors` work in
production, alongside whatever else `/phase-audit 2b`'s post-merge verification already covers
(see the Phase 2a merge entry below for the pattern this should follow).

Standing rule added as a result (`CLAUDE.md` rule 8, `.claude/skills/db-migration/SKILL.md`): a
destructive migration may only be applied after the code that stops depending on the old shape
is deployed to production, not merely committed on a feature branch.

## 2026-09-21 — Pre-launch blocker: all 7 seeded worlds are missing a Boss Quiz

Checkpoint 6 made sequential world-unlock real (`GET /api/v1/worlds`'s `locked` field,
docs/ARCHITECTURE.md D23) and Checkpoint 6's pass-mark fix (D24) tightened it further - a world
only unlocks the next one once its Boss Quiz lesson is actually **passed**
(`settings_kv.lesson_flow_scoring.bossQuizPassMarkPct`, default 60%). Checked directly against the
database: **all 7 seeded worlds (Money World through Elite Summit) are published but have zero
lessons at all**, so none has a Boss Quiz - a real learner reaching World 2+ today would find it
permanently locked, with no possible way to clear it. `GET /api/v1/health`'s new
`worldsMissingBossQuiz` field surfaces exactly this (lists all 7 right now) so it's visible without
a direct DB query.

**Not fixed here, deliberately** - per instruction, the existing published worlds were left alone
(not unpublished) rather than force a disruptive content-authoring pass into this checkpoint.
**Before launch, every world that's meant to be reachable needs at least one published Boss Quiz
lesson**, authored and published through `/admin/lessons` like any other content. Treat
`GET /api/v1/health`'s `worldsMissingBossQuiz` reading non-empty in production as a launch blocker,
same as `legalDocuments` reading anything but `"ok"`.

## 2026-09-20 — Process fix: Phase 2b's first 3 commits landed directly on `main`, corrected

`/phase-kickoff 2b` had no branch-creation step, so Checkpoint 1 (S3 storage plumbing), Checkpoint 2
(Mentors content type), and a follow-up hardening commit (mentor art upload magic-byte validation,
OpenAPI-route-coverage guard test) were committed and **pushed directly to `main`** -
`cb907fd`, `c3cfe81`, `a1bced1` - which auto-deploys to production. This violates the "one branch
per phase, merged only after `/phase-audit`" rule.

Corrected: `phase-2b-content` branch created from `main` at `a1bced1` and pushed
(`origin/phase-2b-content`); all further Phase 2b work happens there. **`main` was not reset or
rewritten** - those 3 commits stay on `main`'s history as-is, since rewriting a branch that already
deployed to production would be worse than the original mistake. This means **`/phase-audit 2b`
must explicitly cover `cb907fd`/`c3cfe81`/`a1bced1` too**, not just what lands on
`phase-2b-content` afterward - they were never audited as part of a phase branch review before
reaching `main`/production the way every other phase's work has been.

Also fixed to prevent recurrence: `.claude/hooks/guard-bash.mjs` now hard-blocks `git commit`
while on `main` and any `git push` targeting `main`, and `/phase-kickoff` now creates and switches
to the phase branch as its first action, before any code change.

## 2026-09-20 — Phase 2a merged to `main` and verified in production. Next: Phase 2b.

`phase-2a-consent` merged into `main` via merge commit `2d29847` (27 commits, kept the branch). Before
merging: the `/phase-audit 2a` security finding below (non-transactional reapproval writes) was
fixed with tests proving real rollback; the publish Yes/No re-approval choice was verified
end-to-end (it was already correctly rejecting a missing/undefined/null choice - the gap was only
in test coverage, now closed); the whole feature was documented in `PRODUCT_SPEC.md`/
`DATA_MODEL.md`/`ARCHITECTURE.md` (new decision D16) where it had been missing; the two throwaway
test accounts (Aarav, Diya) were deleted from the database and confirmed gone; and
`pnpm typecheck`/`lint`/`test` (262 tests)/`build` were all green at the merge commit.

**Production, verified post-merge against `https://finlamma-backend-rho.vercel.app`:**
- `GET /api/v1/health`: `{"status":"ok","database":"ok","migrations":"ok","clerkKeys":"ok","legalDocuments":"placeholder","version":"2d29847","consentPiiHmacKey":"ok"}` -
  `version` matches the merge commit exactly, `consentPiiHmacKey` is `ok` (not `missing`).
  `legalDocuments: "placeholder"` is expected and tracked separately (real text pending outside
  legal review, see the pre-launch checklist) - not a merge regression.
- Every new Phase 2a authenticated endpoint returns 401 without a token, never 500:
  `GET /me/legal-status`, `PATCH /me/date-of-birth`, `POST /me/legal/accept`,
  `POST /me/parent-consent/request`, `POST /me/legal/reapproval/resend`. The intentionally-public
  `GET /api/v1/legal/terms` still returns 200.
- `/admin/legal` and `/admin/consent` both return 307 to `/admin/sign-in` for a signed-out visitor.

**Phase 2a is fully verified end to end and closed. Next up: Phase 2b (learning content).**

## 2026-09-20 — Phase 2a: full-phase audit findings fixed (account-deletion scrub, health version, editor race)

Full-phase `/phase-audit 2a` found 1 High, 1 Medium, 1 Low security/robustness finding, plus a
founder-requested observability addition and a doc-completeness nit. All fixed on
`phase-2a-consent`:

**(High, fixed) Account deletion didn't reach Phase 2a's compliance tables.** Deleting a user
only ever scrubbed the `users` row - `parent_contacts` (the parent's real name/email),
`users.date_of_birth`, and `consent_records` were untouched, and a staff member could still
reveal a deleted child's real parent contact indefinitely. Fixed:
- `anonymizeUserFromClerk` (`src/server/users/repo.ts`) now also nulls `date_of_birth`.
- New `scrubConsentDataForDeletedUser` (`src/server/onboarding/service.ts`), called from both
  self-deletion (`deleteMe`) and the Clerk `user.deleted` webhook, so it runs regardless of which
  side triggers deletion:
  - `consent_records` is **kept** as durable proof consent was once given (status, timestamps,
    accepted legal-document versions) - never deleted.
  - The parent's real email is replaced with **`parent_email_hmac`**, an HMAC-SHA256 keyed by a
    new secret (`CONSENT_PII_HMAC_KEY`, generated with `openssl rand -hex 32` - not from any
    dashboard, you generate and set this yourself in `.env.local` and Vercel), so "was it this
    parent email?" stays verifiable without retaining the raw address. If the key isn't
    configured, deletion still proceeds (never blocks a user's right to delete their account over
    an ops gap) but logs that the HMAC couldn't be stored.
  - The `parent_contacts` row's name/email are anonymized in place **only if no other
    non-deleted account currently shares that parent email** - a still-active sibling's own
    separate row already holds the same info, so erasing this one would achieve nothing. The row
    itself is never deleted (would cascade-delete the `consent_records` row we're deliberately
    keeping).
  - `countChildrenForParentEmail`/`sumRequestsTodayForParentEmail` now exclude deleted accounts,
    so a parent email that only backs deleted/test accounts doesn't stay permanently maxed out.
  - `/admin/consent` hides deleted accounts by default (optional "show deleted" filter, rendered
    as "Deleted, anonymised" with the reveal action disabled - `revealParentContact` now refuses
    outright for a deleted account, even if some PII technically survived the sibling exception).
  - The scrub is itself logged (`consent.data_scrubbed_on_deletion`, no PII in the metadata).
- **Backfill**: checked before writing any backfill code - **zero rows currently need it** (the
  one already-deleted user in this database predates Phase 2a's tables entirely). Plan/SQL kept
  on file (not run) for whenever it's needed:
  ```sql
  -- 1. Null date_of_birth for already-deleted users who still have one
  update users set date_of_birth = null
    where deleted_at is not null and date_of_birth is not null;

  -- 2. For each already-deleted user with a parent_contacts row, either
  --    anonymize (no other active sibling shares the email) or leave as-is
  --    (a sibling is still active) - this needs the same per-row logic as
  --    scrubConsentDataForDeletedUser, so it should run as a one-off script
  --    that calls that function per already-deleted user id, not raw SQL.
  ```
- Added "legal review: retention period for anonymised consent evidence" to `docs/ROADMAP.md`'s
  pre-launch checklist, since `consent_records` (with its HMAC proof) is now kept indefinitely by
  design - counsel should confirm whether that needs its own retention limit.

**(Medium, design proposed, not yet built)** A minor's continued access isn't re-checked against
the parent's approval when a legal document changes - only the minor's own re-acceptance is
checked today. Proposal sent to the founder (a per-version `requires_parent_reapproval` flag set
by staff at publish time); waiting on approval before implementing.

**(Low, fixed)** `upsertDraft` (`src/server/legal/repo.ts`) now catches a concurrent-save race
(two `legal.manage` staff saving the same new draft at once) and retries against the winner's
row instead of crashing with a raw unhandled error - same pattern already used in
`claimConsentRequestSlot`.

**(Observability, founder-requested, added)** `GET /api/v1/health` gained a `version` field -
Vercel's `VERCEL_GIT_COMMIT_SHA`, shortened to 7 characters (`"local"` outside Vercel) - so
confirming what commit is actually deployed no longer requires the Vercel dashboard.

**(Doc nit, fixed)** `docs/DATA_MODEL.md` now explicitly lists `is_placeholder`
(`legal_documents`) and `withdraw_token_hash`/`parent_email_hmac` (`consent_records`), which
existed in the schema but weren't spelled out in the field lists.

## 2026-09-20 — Phase 2a: parental-consent flow (request/confirm/decline/withdraw) + admin review

Built and merged on `phase-2a-consent`: `PATCH /me/date-of-birth` (set-once),
`POST /me/parent-consent/request` (DB-backed rate limiting, atomic per-user cooldown/cap - see
the security-audit fixes below), the public `/consent/confirm` and `/consent/withdraw` pages
(GET is side-effect-free; separate "I consent"/"I do not consent"/"Withdraw consent" POSTs do
the work), `requireFullAccess(user)` (the access gate future phases must call), and the admin
`/admin/consent` review page (`consent.view`, `user_manager`, read-only - every reveal of a
parent's contact details is logged). Both consent pages support English, Hindi and Hinglish via
a language switcher, since a parent reads this page independent of the child's own app-language
setting.

**security-auditor reviewed Checkpoint A before it shipped** and found two real races (both
fixed, commits on `phase-2a-consent`): the resend cooldown/daily-cap could be bypassed by firing
concurrent requests (fixed with an atomic locked transaction), and the per-parent-email abuse
caps compared emails case-sensitively, letting `Parent@x.com`/`parent@x.com` count as different
addresses (fixed by normalizing before every check). Also fixed: the consent-confirm write and
its legal-acceptance rows weren't transactional, and the "log the link instead of emailing it"
dev fallback was keyed off `NODE_ENV`, which is always `"production"` on every Vercel deployment
including preview - fixed to key off `VERCEL_ENV` instead, or preview testing would have been
blocked with a confusing 503 whenever Resend isn't configured.

### Test data - created for manual click-through review, deleted 2026-09-20
Two throwaway rows existed in the shared database purely for testing this flow, created directly
(not through Clerk - no real sign-up happened): `user_test_preview_checkpoint_a` (Aarav,
Checkpoint A - consented, then withdrawn during later manual testing) and
`user_test_preview_checkpoint_b_decline` (Diya, Checkpoint B - declined). **Deleted** ahead of the
Phase 2a merge to `main`: the founder ran the delete in the Supabase SQL Editor (my Supabase MCP
connection is read-only), and it was verified read-only afterward that `users`, `parent_contacts`,
`consent_records` and `legal_acceptances` all show zero rows for both ids - the FK `onDelete:
cascade` on those three tables removed the dependent rows automatically. Their `activity_logs`
entries (`consent.given`, `consent.withdrawn`, `consent.refused`) are kept, per the append-only
rule - same as any real account deletion, they just reference a now-nonexistent user id.

### Withdraw-token lifetime - decided, recorded in ARCHITECTURE.md (D15)
Withdraw links **never expire**, deliberately: DPDP requires withdrawing consent to be as easy
as giving it, and a leaked withdraw link is low-harm (it can only flip a `consented` row to
`withdrawn` - grants no access, reveals no data - and a parent can simply re-consent, which
mints a fresh withdraw token that supersedes the old one on the same row).

### Guardrails confirmed/added around the withdraw flow (2026-09-20, founder review)
- Withdraw tokens are the same strength as consent tokens (`randomBytes(32)`, SHA-256 hashed)
  and can only ever call `withdrawConsentRecord` (flip `consented` → `withdrawn`) - no other code
  path accepts one, so it grants no access and reveals no data beyond the child's first name
  (already shown throughout the app).
- **New:** a deleted account's still-lingering `consent_records` row (soft-delete never removes
  the `users` row) now makes every consent/decline/withdraw token for that account "dead" -
  `isUserDeleted()` is checked on every lookup, so a stale link post-deletion behaves exactly
  like an already-resolved/already-withdrawn one, without revealing that the account was deleted.
- Re-consenting after a withdrawal mints a fresh withdraw token that overwrites the old one in
  place (`consent_records` is one row per user) - confirmed by a new test in
  `src/server/onboarding/service.test.ts`; an old withdraw link can never revoke a newer consent.
- Confirm/decline/withdraw have no *additional* per-click rate limit beyond what they already
  had - the same token-entropy + atomic single-use (or idempotent-for-withdraw) guarantees apply
  uniformly across all three, nothing new added or missing.
- **New:** a withdrawal-confirmation email now sends on a genuine withdrawal (never on the
  idempotent re-click path) via the same Resend-or-console-log fallback as every other email
  here - **also pending the verified Resend domain**, same as the consent-request and
  consent-confirmed receipts.

### Follow-ups (tracked, not fixed now)
- The per-parent-email daily-cap/child-count check still has a residual race across *different*
  accounts racing in lockstep on the same email (documented in
  `src/server/onboarding/repo.ts`'s comments) - the per-user race the audit demonstrated is
  closed, this narrower one needs serializable isolation to close fully and wasn't judged worth
  it yet.

## 2026-09-20 — Phase 2a: legal documents shipped, consent flow in progress

Legal documents domain (SET-16, SET-17) built and merged: versioned Terms/Privacy/
Risk-disclosure, admin Legal document editor (`legal.manage`, super_admin only), and
`scripts/seed-legal-documents.ts` seeding v1 of each type as **published but clearly marked
placeholder** (`legal_documents.is_placeholder = true`, content prefixed
`[PLACEHOLDER — NOT FOR LAUNCH. Not reviewed by counsel...]`).

`GET /api/v1/health`'s new `legalDocuments` field (`ok` / `placeholder` / `unpublished`) is a
non-fatal warning (never a 503) that surfaces this without needing DB access - it will read
`"placeholder"` until a super_admin publishes real reviewed text through the admin editor.

### Follow-ups (tracked, not fixed now)
- **Replace placeholder legal documents after legal review.** Once outside counsel has reviewed
  real Terms/Privacy/Risk-disclosure text (see `docs/ROADMAP.md`'s pre-launch checklist), a
  super_admin must draft and publish the real version through `/admin/legal` - this produces a
  new version with `is_placeholder = false`, which is what flips `GET /api/v1/health`'s
  `legalDocuments` field from `"placeholder"` to `"ok"`. Treat that field reading anything but
  `"ok"` in production as a launch blocker.

## 2026-09-19 — Phase 0-1 audit (`/phase-audit 0-1`)

Audited: Phase 0 (project setup), Phase 1 (identity, roles, activity log).

**Result: PASS. All checks green, both Medium and one Low security finding fixed, and the
production DATABASE_URL misconfiguration this audit surfaced has been corrected and re-verified.**

### What passed
- Every ticked Phase 0/1 roadmap item traced to real, working code.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` (116 tests, 0 failed/skipped) / `pnpm build` all clean.
- All 4 Drizzle migrations applied and schema-matching in the `rzymlgyhifphdsqnczsm` Supabase
  project; RLS enabled on all 6 tables; Supabase advisors clear above INFO level.
- `openapi/openapi.json` / `docs/API_ENDPOINTS.md` current; every route authenticated (or
  intentionally public) and every mutation logged via `logActivity()`.
- Production: `/api/v1/me` returns 401 without a token, both Clerk webhooks return 400 unsigned,
  `/admin` redirects signed-out visitors to `/admin/sign-in`.
- security-auditor over Phase 0-1: 0 Critical/High findings.

### Fixed as a result of this audit
- **(Security, Medium)** Staff lockout: `setStaffMemberActive`/`changeStaffMemberRole` now refuse
  an action that would leave zero active holders of `staff.manage` (was previously possible to
  self-deactivate/self-demote with no recovery path). `src/server/staff/service.ts`.
- **(Security, Medium)** Health check logged raw driver errors unscrubbed; now routed through the
  same `logInternalError` scrubbing every other DB-touching path uses. `src/lib/http.ts` (export),
  `src/app/api/v1/health/route.ts`.
- **(Security, Low)** `roleId` wasn't validated against the `roles` table before use in
  `inviteStaffMember`/`changeStaffMemberRole` - now returns a clean `NOT_FOUND` instead of an
  unhandled FK-violation 500.
- **(Production diagnosability)** `/api/v1/health`'s 503 now includes `details` (expected vs.
  actually-applied migration identifiers) instead of just a generic message - this is what
  surfaced the root cause below within a minute of deploying.

### Production issue - resolved 2026-09-19
`GET /api/v1/health` was returning 503 with `actualLatestAppliedAtMs: null`, meaning production's
`DATABASE_URL`/`DATABASE_URL_DIRECT` pointed at a database with an empty
`drizzle.__drizzle_migrations` table - not the `rzymlgyhifphdsqnczsm` Supabase project this audit
verified has all 4 migrations applied and a matching schema. Two other theories (Vercel
file-tracing missing `drizzle/meta/_journal.json`; CRLF causing a content-hash mismatch) were
investigated and ruled out with direct evidence - see the `8145527` commit message.

You corrected the Vercel production environment variables and redeployed. Re-verified same day:
```json
{"data":{"status":"ok","database":"ok","migrations":"ok","timestamp":"2026-09-19T15:07:21.821Z"}}
```

### Your actions
- **Clerk dashboard**, staff application: confirm public sign-up is disabled (invite-only). The
  code already only grants a `staff_members` row via a signed invite, so this is defense-in-depth
  only, not a live hole.

### Follow-ups (tracked, not fixed now)
- **(Security, Low)** Account deletion can leave a user "stuck" between Clerk-deleted and
  DB-anonymized if the second step throws (`src/server/users/service.ts` `deleteMe()`, comment at
  line 52). Needs a reconciliation job - revisit once Inngest exists (Phase 7).

## 2026-09-19 — Production admin access-denied incident

`/admin` showed "Access denied: your account isn't set up as an active staff member" for a real
staff Clerk user id, right after the DATABASE_URL fix above.

**Root cause: `staff_members` was completely empty in production** - never bootstrapped (expected
for a first-time setup; nobody had run `pnpm seed:super-admin` against the corrected database
yet). Not a Clerk misconfiguration: added a `clerkKeys` field to `/api/v1/health` (decodes both
publishable keys' embedded Frontend API host and compares them - both are public-by-design, so
nothing secret is read) specifically to rule out the STAFF and CONSUMER Clerk apps' keys being
silently swapped, since that would produce this exact symptom too. Production confirmed
`"clerkKeys":"ok"` - the two apps are correctly separate.

**Fixed:** ran the equivalent of `scripts/seed-super-admin.ts` as raw SQL in Supabase's SQL
Editor (my Supabase MCP connection is read-only, so I prepared the SQL and the user ran it):
inserted a `staff_members` row (`id d8db1463-2c7f-4cd9-8533-9357ffd40be9`,
`clerk_user_id user_3JXs4KAH4UsDUDQNKsJTe2jOg03`, role `super_admin`, `active: true`) plus the
matching `staff.bootstrap_super_admin` activity_logs entry. Both verified via the read-only MCP
connection afterward. `/admin` confirmed working.

**Shipped as a result:**
- `/api/v1/health`'s `clerkKeys` check (`ok` / `swapped` / `unconfigured`) - catches the staff and
  consumer Clerk apps' publishable keys being silently pointed at the same instance, which would
  make a real staff sign-in authenticate against the wrong Clerk application and look exactly like
  "not set up as staff" even when the `staff_members` row is correct.

### Webhook re-verification against the corrected database
The original audit only checked that unsigned requests get rejected with 400, not the real
signed-event → DB-write path, and that hadn't been re-tested since the DATABASE_URL fix.

**Staff webhook (`/api/webhooks/clerk-staff`): verified, real invite + real delete.** The user
invited a throwaway test email (`quiz_maker` role) from `/admin/staff`, accepted it, then deleted
the test account in the Clerk dashboard. Full trail confirmed via Supabase, all consistent and in
order:
| Time (UTC) | Event | Evidence |
|---|---|---|
| 15:40:22 | Invite sent | `staff.invited`, actor = the super_admin seeded above, target `inv_3JYKB66Nt4KnneZittFr8W7stZ9` |
| 15:44:19.8 | Real `user.created` webhook on accept | `staff_members` row `b950044d-...`, `role_id` = `quiz_maker` (matches invite) |
| 15:44:20.2 | Invite completion logged | `staff.joined_via_invite` |
| 15:46:05.2 | Real `user.deleted` webhook on delete | `staff_members.active` → `false` |
| 15:46:06.6 | Deactivation logged | `staff.deactivated_from_clerk` |

A real accepted invite is stronger evidence than Clerk's synthetic "Send Example" events - it only
reaches `completeStaffInviteFromClerkEvent` at all if signature verification, `public_metadata`
role-reading, and the DB write all worked correctly end to end.

**Consumer webhook (`/api/webhooks/clerk`): verified, real signup + real delete.** The user signed
up email-only (no phone) via the consumer Clerk app's Account Portal, then deleted the account in
the Clerk dashboard. Full trail confirmed via Supabase, all consistent and in order:
| Time (UTC) | Event | Evidence |
|---|---|---|
| 15:59:52.7 | Real `user.created` webhook on signup | `users` row `202d092e-...`, `email` set, `phone`/`first_name`/`last_initial` null (matches email-only signup with no name collected) |
| 15:59:53.2 | Sync logged | `user.synced_from_clerk`, `metadata.clerkEventType: "user.created"` |
| 16:01:46.0 | Real `user.deleted` webhook on delete | `deleted_at` set, `email`/`phone`/`last_initial` cleared, `first_name` → `"Deleted user"` (a deliberate display placeholder per the comment in `anonymizeUserFromClerk`, `src/server/users/repo.ts:83-86` - carries no personal data) |
| 16:01:47.5 | Deletion logged | `user.deleted_from_clerk` |

**Both webhooks fully re-verified against the corrected production database with real signup and
delete events. Item 4 complete.**

## Phases 0 and 1: fully verified

Every check from the 2026-09-19 audit passes, every finding it raised is either fixed or an
explicitly tracked follow-up, the production DATABASE_URL incident is resolved, the admin
access-denied incident is resolved, and both Clerk webhooks are proven working end to end against
the real production database with real (not synthetic) events. Ready to start Phase 2.

Still open (not blocking):
- **Your action**: confirm in the Clerk dashboard that the staff app has public sign-up disabled
  (defense-in-depth only - the code already only grants staff access via a signed invite).
- **(Security, Low, tracked)** account-deletion Clerk-then-DB ordering gap - revisit once Inngest
  exists (Phase 7).
