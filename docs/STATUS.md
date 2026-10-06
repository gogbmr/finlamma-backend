# Status

## 2026-10-06 — Production incident: authenticated `/admin/(dashboard)/*` hangs ~300s. Confirmed the SAME bug as 2026-10-05's "dev-mode" entry below, not a separate issue

A real, fresh-incognito-confirmed signed-in staff session (so not a stale/corrupted cookie) hitting
any `/admin/(dashboard)/*` route (e.g. `/admin/worlds`) hangs for ~300s (Vercel's serverless
function max duration) and then shows the admin error boundary. Blocking: no content management,
consent review, or Doubt Zone moderation is possible right now.

**Investigated read-only, no changes made first:**
- Diffed the entire shared admin path - `src/app/admin/layout.tsx`, `src/app/admin/(dashboard)/
  layout.tsx`, `src/components/admin/admin-nav.tsx`, `src/lib/auth.ts`, `src/server/staff/repo.ts`,
  `src/server/trading/service.ts`, `middleware.ts`, `src/db/client.ts` - between the last point
  before `design-pass-homepage-admin` (`0f114cb`) and production (`eb58a5d`): **byte-for-byte
  unchanged.** That design pass's only admin-touching changes are purely synchronous/presentational
  (`PageHeader`'s new icon chip, the new `KpiTile` component, per-page icon props) - ruled out.
- Live `curl` against production (read-only): `GET /api/v1/health` 200 in 9.2s (a cold start, not a
  hang - it also does several DB reads); `GET /admin` signed out 307 in 1.3s; `GET /admin/sign-in`
  200 in 0.6s; `GET /admin/ops` signed out 307 in 0.6s; `GET /admin/analytics` signed out 307 in
  0.7s. **Every signed-out path is fast and healthy** - including the `(dashboard)/layout.tsx`
  branch that calls `auth()` twice when there's no staff row, which proves `auth()` itself resolves
  fine when there's no session cookie to validate.
- **Conclusion: this isolates the hang to `auth()` resolving a REAL, valid session** - the one path
  neither 2026-10-05's dev-mode investigation nor any prior phase's production verification (every
  one of which only ever checked the signed-out 307 redirect) actually exercised. **This is the
  same bug as the 2026-10-05 entry below, not two separate issues** - both are the authenticated /
  real-middleware-execution path in this exact Next 16.3.5 + `@clerk/nextjs` 7.9.4 combination.
  2026-10-05's "the Vercel preview should be unaffected" conclusion was wrong: a signed-out redirect
  can't prove `clerkMiddleware()` ran at all, since `auth()` resolves "no session" fast either way.

**External research (read-only, no upgrade performed):** Next 16's `middleware.ts` → `proxy.ts`
migration is actively unstable as of this month. `vercel/next.js#93328`: Turbopack produces an
**empty middleware-manifest** for `proxy.ts` on Windows (Next 16.2.4/16.3.0-canary.3) - the
"proxy ran" response header simply never appears, which is mechanically exactly what Clerk's "was
not run" check detects. `clerk/javascript#8302` (`auth.protect()` misredirects under Next 16's
proxy) and `#9405` (a different Clerk/App-Router hang-after-redirect) show the same subsystem is
broadly unsettled right now, though no single existing issue is a confirmed exact match for our
precise symptom combination. `@clerk/nextjs` is pinned to exactly `7.9.4`; **`7.9.5` (one patch
later) fixed "a cross-request credential leak in `clerkMiddleware()`"** - not confirmed as our bug,
but hard evidence of a real correctness bug in that exact function immediately after our pinned
version. Latest patch in range: `7.9.11`. `next` is pinned to `16.3.5`; latest patch is `16.3.8` -
no changelog text confirms a specific middleware fix, but it's the same minor line as the active
bug reports above.

**Recommended path, not yet performed, pending the founder's decision:**
1. Patch-bump `@clerk/nextjs` 7.9.4 → latest 7.x patch and `next` 16.3.5 → latest 16.3.x patch
   (both in-range, no declared breaking API changes) - the lowest-risk first step.
2. **Whatever is tried, re-verification must hit every `/admin/(dashboard)/*` route with a REAL
   signed-in staff session, not just the signed-out redirect** - that blind spot is shared by this
   incident, 2026-10-05's entry, and every prior phase audit's "admin redirect behavior correct"
   check, none of which actually proved the authenticated path worked.
3. Only if the hang survives the patch bumps: redo the `middleware.ts` → `proxy.ts` rename per
   Clerk's exact documented migration (rename the exported function to `proxy`, not just the file -
   2026-10-05's attempt only renamed the file, which may be why it reproduced identically).
4. No evidence supports a Clerk v8 or Next 17 major jump as necessary or sufficient.

**Mitigation shipped as diagnostics, not a fix**, on branch `admin-hang-instrumentation` (not yet
merged): the dashboard layout's `getStaffMember()` call (the `auth()` call) and the 22-permission
`Promise.all` are now wrapped in a 15s timeout with start/resolve/reject timing logged server-side
(`[admin-shell] ...`), so the next occurrence fails fast with a clear logged message instead of
silently hanging the full 300s. This does not fix the root cause - it exists so the next failure
tells us exactly where the time goes.

**Verified before considering this safe to merge (founder asked specifically whether a timeout
could render a half-permissioned admin shell - it cannot, confirmed two ways):**
- The two guarded calls' results (`staff`, and the 22 permission booleans + `role`) are only ever
  assigned inside their respective `try` blocks; every render path that uses `visibility` sits
  strictly after both `try` blocks complete successfully. A thrown/timed-out error returns a
  dedicated `AdminShellFailure` panel immediately, before `visibility` is ever constructed - there
  is no code path where some permissions are resolved and others aren't. TypeScript's control-flow
  analysis independently confirms this (the permission variables are declared `let` with no
  initial value and used after the `try` - `tsc --noEmit` would reject "used before assigned" if
  the catch's early `return` didn't make that safe).
- **Found and fixed a real gap while checking this**: `./error.tsx` does NOT catch an error thrown
  by `./layout.tsx` in the same route segment - confirmed against this Next version's own bundled
  docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`: "It
  does not wrap the `layout.js` ... in the same segment"). There's also no `src/app/admin/error.tsx`
  or root `global-error.tsx`. So a bare `throw` from the timeout wrapper would NOT have hit the
  existing styled "Something went wrong" panel - it would have fallen through to Next's generic
  default error page, with the real diagnosis visible only in server logs, not to whoever's staring
  at the hung page. Fixed by catching explicitly inside `DashboardLayout` itself and rendering a
  dedicated `AdminShellFailure` panel (shows the actual timeout/error message, not a generic one -
  safe since this is staff-only) rather than relying on an error boundary that couldn't reach it.
- **Known, deliberate gap, matching the original scope (auth() + the permission `Promise.all`
  only)**: `getMarketControls()` (the halt-banner read, below both guarded calls) is unwrapped and
  already fails safe on *rejection* (`.catch(() => false)`), but a *hang* there specifically would
  not be caught by this patch and would still run the full ~300s. Not fixed here since it wasn't
  in the requested scope and is a separate, lower-probability read - flagged so it's a known
  limitation, not a silent gap.

## 2026-10-05 — Known limitation: local `pnpm dev` returns 500 on `/admin/*` (Clerk/Next 16 dev-mode bug, not a real misplacement) — CORRECTED 2026-10-06 above: this is the same bug as the production hang, not dev-only

While doing the `design-pass-homepage-admin` design pass, local `pnpm dev` started throwing on
every `/admin/*` request: `Clerk: clerkMiddleware() was not run, your middleware or proxy file
might be misplaced. Move your middleware or proxy file to ./src/middleware.ts.` The message is
misleading - diagnosed in full before touching anything:

- `middleware.ts` has always lived at the project root and this branch never touched it
  (`git log main..HEAD -- middleware.ts` is empty). Root placement is explicitly valid per
  Next.js's own docs even with a `src/app` directory.
- Traced the message into `@clerk/nextjs`'s source (`fs/middleware-location.js`): whenever
  `src/app` exists, Clerk's hint generator *always* suggests moving the file into `src/`,
  regardless of whether root placement is actually the problem. It's a generic guess attached to
  a different, real error ("Clerk can't find its auth-status header on this request"), not a
  diagnosis.
- Reproduced identically under `pnpm dev` (Turbopack) and `next dev --webpack` - rules out
  Turbopack specifically. It's a `next dev` (dev server) problem in general.
- `pnpm build && pnpm start` locally reproduces **correctly** - `/admin/ops` 307-redirects to
  `/admin/sign-in` with a proper `x-clerk-auth-status: signed-out` header, exactly like
  production. So this is a dev-vs-build split, not local-vs-deployed - the branch's Vercel preview
  (which runs a production build) should be unaffected.
  **Correction (2026-10-06): this conclusion was wrong.** Only the signed-out redirect was ever
  tested here - a real authenticated staff session hangs in production too (see the entry above).
  A signed-out request can't actually prove `clerkMiddleware()` ran, since `auth()` resolves "no
  session" fast either way - this test was unfalsifiable for the thing it was meant to confirm.
- Tested, as a temporary and fully reverted experiment (not committed), whether Next 16's
  `middleware.ts` → `proxy.ts` rename was the real cause: with *only* a `proxy.ts` present (same
  content, `middleware.ts` moved aside), the exact same 500 reproduced. So renaming would not have
  fixed it, and the working tree was restored to clean before concluding.

**Decision**: leave this as a known, documented limitation rather than chase an upstream fix now -
bumping Next/Clerk on a project with 2,298 passing tests to fix a local dev-only convenience isn't
worth the risk. **Workaround**: use `pnpm build && pnpm start` locally when testing `/admin/*`, or
review on the branch's Vercel preview. See `CLAUDE.md`'s Next.js breaking-changes note and the
pre-launch checklist item to re-test this after any future Next/Clerk upgrade.

**Separate, unrelated known issue hit during the same investigation**: killing a `next dev`
process (e.g. via `taskkill`) can corrupt `.next/dev/types/*`, which then makes `pnpm build` fail
its own TypeScript check with nonsense syntax errors ("Unterminated template literal") in
generated route-type files, not real code. Fix: `rm -rf .next` before rebuilding. Already known
from the design-pass session's earlier Turbopack-hang workaround; recorded here again since it
resurfaced during this investigation.

## 2026-10-04 — `/phase-audit 9` complete. Two Low findings, both fixed; branch pending `/publish-contract`

Audited Phase 9 (Analytics & homepage) in full, with six focus areas the founder specified beyond
the standard checklist: analytics privacy (no PII/free-text/DOB/email/state/Doubt-Zone content
reachable, including the pre-consent onboarding-funnel events), `distinct_id`/`identify()`/session
recording, never-blocks/fails-silently (including the `after()` scheduling path), `POST
/api/track`'s hardening as a public endpoint, `/admin/analytics`'s query boundedness and
non-identifying tiles, and `robots.txt`/`sitemap.ts` not exposing `/admin`/`/api`.

**Clean**: all 3 ROADMAP items have real, tested code; migration journal (49 entries) matches
`drizzle.__drizzle_migrations` exactly (Phase 9 added zero schema changes); RLS enabled with zero
policies across all 71 `public` tables (`select count(*) from pg_policies` → 0); zero WARN-or-above
Supabase advisors (the existing 40-unindexed-FK/49-unused-index INFO findings are unchanged,
already tracked); `pnpm typecheck`/`pnpm lint`/`pnpm build` clean; `pnpm test` 229 files/2289 tests
green, 0 skipped; OpenAPI contract regeneration produced a byte-identical diff; production (`main`,
Phase 9 not yet merged) healthy, deployed commit (`4309612`) matches `origin/main` exactly, and
`/api/track`/`/robots.txt` correctly 404 there (not yet deployed, as expected pre-merge). A
dedicated security-auditor subagent pass over every analytics call site and the new admin
dashboard found no Critical/High findings and independently confirmed `docs/ARCHITECTURE.md`
D69/D70's stated privacy design actually matches the shipped code.

**FEATURE_MAP correction**: NW-43 (News Desk's 7-day Pulse Check engagement chart) was marked "Not
built" but is actually built - under Phase 5, via `getPulseCheckEngagement()` and
`engagement-chart.tsx` - the row was just never updated at the time. Fixed in this audit.

**Two Low findings, both fixed**:
1. **`POST /api/track`'s IP-based rate limit fails open during a Redis outage/misconfiguration** -
   already the deliberate, documented behavior (same `failOpen: true` posture as
   `LESSON_STEP_RATE_LIMIT`), not a code defect, but per the founder's standing rule after D67/D68
   (a decision's text must match reality, and an accepted tradeoff deserves the same paper trail a
   bug fix gets) - recorded as D71 rather than left as an undocumented assumption.
2. **`POST /api/track` accepted `platform` alongside `homepage_viewed`** (no security/PII impact -
   `platform` is a closed two-value enum either way) - fixed with a `.refine()` on
   `TrackRequestSchema` rejecting the combination; one new test.

## 2026-10-04 — Phase 8 merged to `main` (00c1dec), production verified

Merge commit `00c1dec`. Vercel redeployed within the first poll after push. Verified directly
against production (`curl`, not the earlier audit's limited tooling):

- `GET /api/v1/health` — `version: "00c1dec"`, every field `ok` (`market`/`push` still `mock` -
  no vendor keys configured yet, pre-existing and expected; `legalDocuments: "placeholder"` -
  pre-existing, already a blocking pre-launch item, not new).
- `GET /api/v1/me/entitlements` with no auth — `401`, not `404` (route is live, correctly gated).
- `POST /api/webhooks/revenuecat` with an empty, unsigned body — `503 SERVICE_UNAVAILABLE`
  ("RevenueCat webhook secret not configured"), not 500 or 200. This is the CORRECT fail-closed
  behavior for right now, not a gap - neither `REVENUECAT_WEBHOOK_SECRET` nor
  `REVENUECAT_WEBHOOK_AUTH_HEADER` is set in production (no RevenueCat account exists yet). Once
  either is set, the same request will correctly return 400 instead.
- `POST /api/webhooks/clerk` unsigned — `400 INVALID_SIGNATURE` ("Missing svix headers"), as before.
- `GET /admin` signed out — `307` redirect to `/admin/sign-in`.
- `GET /` homepage — `200`.
- `GET /api/openapi.json` — `info.version: "1.3.0"`, matching the `/publish-contract` run.

**`ads_config` is deliberately left unseeded in production** - `getAdsSettings()`'s code fallback
(`DEFAULT_ADS_SETTINGS`, position 3) is identical to what the seed script would insert, so there
is no functional difference either way. Rather than write to the production database for a
cosmetic admin-dashboard convenience (seeing/editing the value in Settings instead of only in
code) outside of a deliberate migration/seed step, this is now tracked as a pre-launch checklist
item (`docs/ROADMAP.md`) instead of an immediate action.

## 2026-10-04 — `/phase-audit 8` complete. Four findings fixed (one Critical), branch pending `/publish-contract`

Audited Phase 8 (Monetisation) in full: both ROADMAP items, FEATURE_MAP (zero rows assigned to
Phase 8 - nothing to check there), code health, the Supabase database, the API surface,
production, a dedicated security audit focused on the user's five specific asks, and
docs-vs-reality.

**Clean**: migration 0048 applied and matches `src/db/schema/monetisation.ts` exactly, RLS
enabled with zero policies on `entitlements`/`webhook_events`, zero WARN-or-above Supabase
advisors, `pnpm typecheck`/`pnpm lint`/`pnpm build` clean, `pnpm test` 224 files/2259 tests green,
zero `vmoney_ledger`/`xp_events` references anywhere in this phase's code (confirmed by grep and
independently by the security-auditor), webhook secrets/signatures never logged, production
baseline (main, Phase 8 not yet merged) healthy with its deployed commit matching `origin/main`
exactly.

**Four issues found and fixed same day**:
1. **[Critical] `processRevenueCatWebhookEvent` granted `ad_free` to any `app_user_id` with zero
   age check** - `docs/ARCHITECTURE.md` D67's claim that "a minor's account can never successfully
   complete a RevenueCat purchase flow" was not actually true in the shipped code; the only
   enforcement that existed was the client-facing `canSubscribe` flag, which the webhook never
   consulted. Fixed: both the webhook AND the daily reconciliation job now check
   `treatAsMinorForMonetisation(user.dateOfBirth)` before any grant/extension, recording a blocked
   attempt via the activity log (`monetisation.minor_purchase_blocked`, no payment data) for staff
   follow-up. Recorded as D68; D67's text corrected to match reality.
2. **[Medium] `entitlements.raw` stored RevenueCat's entire webhook event verbatim**, including
   store transaction identifiers and potential subscriber-attribute PII. Fixed: persists only an
   explicit allowlist (event id/type/timestamp/store) instead of the full passed-through object.
3. **[Medium] No protection against two different webhook events for the same user arriving out of
   order** - RevenueCat makes no delivery-order guarantee, and the schema didn't even capture its
   `event_timestamp_ms` field. Fixed: captures that field and ignores a genuinely older event
   rather than letting it regress already-applied newer state.
4. **[Low, latent] `isMinor()` resolved to "not a minor" on an unparseable, non-empty date string**
   (`NaN < 18` is `false` in JS) - unreachable today (every real call site already guards with a
   Zod schema, the Postgres `date` column type, or a truthy-check), but hardened to fail closed
   since it's a shared primitive used for consent gating too.

**Two non-blocking items left open at audit time, both resolved after merge** (see the entry
above, dated the same day): the webhook/`/admin` production checks were verified directly once
Phase 8 was live; `ads_config` was deliberately left unseeded (not an oversight) and moved to the
pre-launch checklist instead of seeded ad hoc.

**The user ran `/publish-contract` and merged** - see the entry above.

## 2026-09-30 — `/phase-audit 7` complete. Eight findings fixed, branch pending `/publish-contract`

Audited Phase 7 (Notifications & Doubt Zone) in full: both ROADMAP items plus the parent
re-approval-email Inngest job, all 10 matching FEATURE_MAP rows (WH-18/19/20/21/23/24, PR-29,
SET-07, SET-14, LF-15), code health, the Supabase database, the API surface, production, a
dedicated security audit, and docs-vs-reality. Full method and evidence in the audit transcript;
summary below.

**Clean**: migrations (47/47 applied, zero drift), schema (every new table/column/constraint for
`doubt_threads`/`doubt_messages`/`notifications`/`notification_prefs`/`push_tokens` matches
`src/db/schema/*` exactly), RLS enabled with zero policies on all 69 public tables, zero
WARN/ERROR-level Supabase advisors, `pnpm typecheck`/`pnpm lint` clean, all 10 FEATURE_MAP rows
have real evidence, production health OK with `version` matching `origin/main` exactly (Phase 7
correctly not live yet), IDOR protection explicitly unit-tested, no raw SQL anywhere, no secrets
logged. `pnpm build` could not be verified locally (sandbox has no network path to Supabase for
static-page prerendering - not a Phase 7 code issue; the next real Vercel build is the true check).

**Eight issues found and fixed same day** (from the security-auditor subagent plus a docs-reality
pass):
1. **[Medium] Doubt Zone moderation list showed the safety classifier's free-text reason**
   (which can paraphrase/quote a learner's own words) to any `doubt_zone.moderate` staff member on
   page load, with no `logActivity` call - unlike the content reveal, which was already correctly
   logged. Fixed: `doubt_messages.flagged_category` (additive migration) is a new coarse,
   never-free-text enum shown in the list; the classifier's actual `flagged_reason` text now lives
   behind the same logged reveal action as message content (D64).
2. **[Medium] A classifier outage left the learner's message flagged: false forever** -
   indistinguishable from a message the classifier actually cleared, so it never reached the
   moderation queue even if it happened to be a real signal. Fixed: a classifier failure now flags
   the message `classifier_unavailable` before re-throwing the same `SERVICE_UNAVAILABLE` error to
   the client.
3. **[docs]** `docs/ARCHITECTURE.md`'s decisions table had zero Phase 7 entries despite several
   real architectural calls made this phase. Fixed: D63-D65 record the safety classifier design,
   flagged-only moderation, and the push-provider/notification-audience choices.
4. **[docs]** `openapi.json`'s `info.version` was still `1.1.0` (Phases 5+6's catch-up bump) and
   `openapi/CHANGELOG.md` had no Phase 7 entry, despite the contract itself being current (ad-hoc
   `pnpm contract` runs kept it accurate) - the exact incident pattern `CLAUDE.md` already warns
   about. **The user runs `/publish-contract` themselves** (it's `disable-model-invocation` - I
   cannot trigger it) before this branch merges.
5. **[Low]** `flagOnAnySignal` covered all three safety categories under one toggle - if ever
   switched off, it would have silently stopped the deterministic crisis redirect for
   `self_harm_or_suicide`/`abuse_or_neglect`, not just the intentionally fuzzier
   `other_wellbeing_concern` bucket. Fixed: the two highest-severity categories now always flag,
   regardless of the toggle.
6. **[Low]** A push token reassignment (the same Expo token string submitted by a different
   account) happened silently, with no audit trail. Fixed: `notifications.push_token_reassigned`
   is now logged (old/new user id only, never the token value).
7. **[Low]** `DELETE /me/push-token` was the one endpoint missing `requireFullAccess`, inconsistent
   with every sibling route (not exploitable - it can only ever remove the caller's own token).
   Fixed for consistency.
8. **[docs]** The pre-launch checklist's unindexed-FK/unused-index advisor counts were stale
   (25/25, last counted at Phase 4). Updated to the current 40/49, and added a new BLOCKING item:
   define who holds `doubt_zone.moderate` and write a policy for handling flagged safety content
   involving minors - the technical side is built, the human process behind it is not.

Re-verified after fixes: `pnpm typecheck` (0 errors), `pnpm lint` (0 errors, 3 pre-existing
warnings), `pnpm test` (216 files, 2188 tests, all passing).

**Ready for merge to `main` once the user runs `/publish-contract`** and sets
`INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY` in Vercel (production currently reports
`inngest: unconfigured` - without this, none of Phase 7's four new notification cron jobs, or any
existing Inngest job, will actually run once merged).

## 2026-09-30 — Phase 7 Doubt Zone AI: built and unit-tested, NOT yet verified against a real model

Checkpoints 1-3 (schema, safety classifier core, streaming endpoints) are built with the safety
design from the Phase 7 kickoff decisions (`docs/ARCHITECTURE.md`): the classifier fails closed
and is biased heavily toward false positives, the advice-language circuit breaker cuts a reply
mid-stream, staff visibility is flagged-only, and every replacement message (safety redirect,
advice-language fallback, thread disclosure) is a fixed `settings_kv` string, never model-generated.

**All of this is verified only against mocked Anthropic responses in the automated test suite.**
An attempt to run live probes against the real API (a normal question, a direct advice request, an
off-topic question, a safety-worded probe, a prompt-extraction attempt, a personal-details message,
each in all three languages) was blocked: `ANTHROPIC_API_KEY` isn't set in the local `.env.local`
(confirmed by presence check only, per CLAUDE.md rule 9 - never read/print the actual value). The
static, non-model-generated copy (thread disclosure, safety redirect with helpline numbers, advice-
language fallback) was printed and read directly - see below - but no real model output has been
seen for this feature yet. Added as a BLOCKING `docs/ROADMAP.md` pre-launch item: run these probes
for real once the key is available, and review actual (not mocked) responses before launch,
especially the safety-redirect tone and whether the model ever slips into advice-like phrasing the
circuit breaker has to catch.

**Static copy read directly (not summarized) and looks reasonable as a first draft**, but the
safety-redirect message is explicitly marked DRAFT pending review by someone qualified (a
counsellor or child-safety professional) - see the separate BLOCKING helpline-verification item
already in `docs/ROADMAP.md`.

## 2026-09-29 — `/phase-audit 6` complete. Six findings fixed, branch ready for merge

Audited Phase 6 (Arena & Social) in full: ROADMAP items vs. code, every FEATURE_MAP AR-row and
PR-03 vs. code, code health (typecheck/lint/test/build), the Supabase database (migrations,
schema drift, RLS, advisors), the full API surface and contract freshness, the live production
deployment, a dedicated security review, and an independent re-verification of the D60 tx-handle
sweep. Full method and evidence in the audit transcript; summary below.

**Clean**: kid-safety field exposure (every Arena/competition response schema read end to end -
no email/DOB/state/school/parent info/full name/bio anywhere; `users.state` only ever appears as
the caller's own scope label, never on another learner's row), the D52 privacy floor (proven to
gate settlement and payout, not just display), D54 demote-visibility (never leaks on another
learner's row through any endpoint), league settlement and competition-prize money paths
(idempotent under concurrency, weekly-cap and best-zone-only enforced correctly, D57's
"competition trading never writes to `vmoney_ledger`" guarantee holds), and the D60 sweep (a
fresh, independent re-check of all 29 `db.transaction` blocks found 0 violations, matching the
original sweep exactly). Database: 43/43 migrations applied with zero drift, zero schema drift
across all 13 Phase 6 tables, RLS enabled on 63/63 public tables with zero policies anywhere,
nothing above INFO on either advisor. API surface: all 74 route files / 78 endpoints registered,
documented and contract-current; every mutating route logs activity; every route authenticated
or intentionally public. Production: health OK, auth/webhook/admin-redirect behavior all correct,
deployed commit matches `origin/main` exactly (Phase 6's own endpoints correctly 404 in
production since this branch hasn't merged yet).

**Six issues found and fixed same day:**
1. **[Medium] Cheer daily-cap concurrency race** (`src/server/arena/service.ts`'s `sendCheer`) -
   distinct simultaneous senders could each read the per-receiver daily cap as unreached and each
   credit past it. Fixed by locking the receiver's row and wrapping insert-cheer + read-caps +
   credit-XP in one transaction (docs/ARCHITECTURE.md D61), proven with a real-Postgres (PGlite)
   concurrency test (`src/server/arena/cheer-concurrency.test.ts`).
2. **[Low] Competition prize `vmAmount` had no upper bound** - added `.max(MAX_REWARD_AMOUNT)`,
   matching every other admin-set VM figure in the codebase (D61).
3. **[Low, docs] `docs/DATA_MODEL.md` was stale for the whole of Phase 6** - still showed the
   pre-rename `virtual_capital_vm` column name D57 says was changed before any code existed
   specifically to avoid this confusion, and was missing four tables entirely. Fixed, and D61
   records that the drift undermined D57's own stated reasoning.
4. **[Info] AR-20's "Arena ROI" field, never built, now a recorded decision** - omitted
   deliberately (a minor's trading-performance figure on a public page invites unhealthy skill
   comparison), not left as an undocumented gap. Recorded as D62.
5. **[Info] `getLeagueMemberZone` was dead code** that would have bypassed D54's visibility
   masking if ever wired up. Deleted (no callers existed).
6. **[Info] "External" badges' `vmReward` could be set to a nonzero value that nothing ever
   pays** - forced to 0 for `criteria.type === "external"` at the schema level
   (`src/server/badges/schemas.ts`), not left as an admin-form note.

Re-verified after fixes: `pnpm typecheck` (0 errors), `pnpm lint` (0 errors, 3 pre-existing
warnings), `pnpm test` (197 files, 1996 tests, all passing), `pnpm build` (succeeds). All six
`docs/FEATURE_MAP.md` rows this audit touched (AR-01 through AR-24, PR-03) have their Status
column set to what was actually verified, not assumed.

**Ready for merge to `main`** pending the user's own `/publish-contract` step (openapi.json/
docs/API_ENDPOINTS.md regeneration was deliberately left to that step, not run as part of this
commit, since the `vmAmount` cap change touches the generated schema).

## 2026-09-28 — `questions.topic` dropped for real. `drop-questions-topic` merged (`85ef90f`), production fully verified

`drop-questions-topic` merged into `main` via merge commit `85ef90f`. The DROP COLUMN SQL (with its
matching `drizzle.__drizzle_migrations` tracker row - see the entry below for the exact block and
hash) was run in the Supabase SQL Editor **after** confirming the merge had deployed, per the
ordering this migration specifically required (code first, SQL second - see below for why that's
the opposite of the `vmoney_ledger.amount` precedent).

**First run silently did nothing**: the SQL Editor showed `ALTER TABLE` / `INSERT 0 1` / `COMMIT`,
but a read-only recheck immediately after found production `GET /api/v1/health` still `503`
("migrations pending", `actualLatestAppliedAtMs` still at migration `0037`'s timestamp),
`questions.topic` still present in `information_schema`, and `drizzle.__drizzle_migrations` still
at 38 rows with no new hash - i.e. none of it had actually landed on the real database, despite the
Editor reporting success on all three statements. Root cause: the SQL Editor tab was pointed at a
different Supabase project than the one `DATABASE_URL` actually targets (`rzymlgyhifphdsqnczsm`) -
an easy mistake with more than one project open, and one a "did it succeed" glance at the Editor's
own output can't catch, since a valid connection to the WRONG database still reports normal
success for every statement. **Caught before being recorded as done, by re-running the same
read-only checks against the real project rather than trusting the Editor's output alone.**

**Re-run in the correct project, verified clean afterward:**
- `GET /api/v1/health`: `200`, `version: "85ef90f"` matching the merge commit, `migrations: "ok"`,
  every other field unchanged/healthy from the prior verification.
- `information_schema.columns` on `questions`: `topic` gone, `topic_id` present.
- `drizzle.__drizzle_migrations`: 39 rows, matching `drizzle/meta/_journal.json`'s 39 entries on
  `main` exactly. Latest row (`id: 39`) has `hash: c496af52756a254d1d6e2ed2b9c2ee480c059440f76b237
  687369de45148c0ab`, `created_at: 1790606220902` - both match the migration file's computed hash
  and the journal's last entry (`0038_massive_pete_wisdom`) exactly.

**`questions.topic` is fully retired.** Its replacement, `questions.topic_id` (FK to the shared
`topics` table, D18/Phase 5), has been the only live taxonomy since Checkpoint 1.

## 2026-09-28 — `fix-report-card-topic-id` merged to `main` (`7733523`), verified in production. `questions.topic` drop migration prepared on its own branch

Production `GET /api/v1/health` confirmed `version: "7733523"` matching the merge commit, everything
else unchanged from the prior verification. Re-ran the read-only dependency check for
`questions.topic` on `main` at this commit: clean - every remaining `.topic` hit in `src/` is either
an unrelated field name (the Pulse Check/report-card API's own `topic` response field, already
sourced from `topics.name`/`topicId`) or a comment documenting the replacement. Nothing reads or
writes the column anymore.

**Migration prepared on `drop-questions-topic`** (not `main`): `src/db/schema/questions.ts` no
longer declares `topic`, `pnpm db:generate` produced `drizzle/0038_massive_pete_wisdom.sql`
(`ALTER TABLE "questions" DROP COLUMN "topic";` - a single-statement, no-other-table-affected
migration, confirmed via `information_schema` that no view depends on the column and the real
`questions` table currently has 0 rows total, so there's no data loss either way). `pnpm
typecheck`/`lint`/`test` all clean. **Not applied to the real database yet** - the SQL block
(including the matching `drizzle.__drizzle_migrations` tracker row, hash computed identically to
`drizzle-orm`'s own migrator - see `node_modules/drizzle-orm/pg-core/dialect.js`'s `migrate()`)
was handed to the founder to run directly in the Supabase SQL Editor, since `pnpm db:migrate`
itself has a known connectivity issue from this environment (2026-09-23 entry below). Branch stays
open until that's confirmed applied.

## 2026-09-28 — Phase 5 merged to `main`, verified in production. Follow-up migration (drop `questions.topic`) blocked on a real dependency, fix branch ready

`phase-5-news-pulse` merged into `main` via merge commit `ed89597`.

**Production, verified post-merge against `https://finlamma-backend-rho.vercel.app`:**
- `GET /api/v1/health`: `version` is `ed89597`, matching the merge commit exactly. `database`,
  `migrations`, `storage`, `redis`, `consentPiiHmacKey`, `clerkKeys`, `relaySecret`, `tradingHalt`
  all `ok`. `market: "mock"` and `inngest: "unconfigured"` are expected, pre-existing states, not
  caused by this merge. `legalDocuments: "placeholder"` and `worldsMissingBossQuiz` (all 7 worlds)
  are the same pre-existing, tracked pre-launch items as every prior phase's verification.
- All 10 new News/Pulse Check endpoints (`GET /news/feed`, `/news/{id}`, `/news/desk-picks`,
  `/pulse-check/current`, `/pulse-check/{id}/result`; `POST /news/{id}/read`, `/pulse-check/start`,
  `/pulse-check/{id}/finish`, `/pulse-check/{id}/steps/{n}/serve`, `.../answer`) return `401`
  signed out, never `404` - routing confirmed live.
- `/admin/news` `307`-redirects to `/admin/sign-in` signed out. `/` returns `200`.

**Follow-up migration prep (dropping `questions.topic`, replaced by `questions.topicId` +
the `topics` table, per D18/Checkpoint 1) found a real, live read dependency before writing any
SQL** - exactly the class of incident CLAUDE.md rule 8 exists to prevent. `src/server/report-card/
repo.ts`'s `listAnsweredQuestionHistoryForUser` still selected the old free-text `questions.topic`
column directly, feeding the weekly report-card job's retention/topic-mastery/opportunity-topic
metrics (`metrics.ts`, `coach-notes.ts`) - live since Phase 3b. Dropping the column as-is would have
broken that query outright with a "column does not exist" error, not a graceful degrade (Drizzle
compiles a literal column reference into the SQL regardless of whether the value is ever
non-null). Write side was already clean - nothing has written `questions.topic` since before
Phase 5.

**Fixed on its own branch, `fix-report-card-topic-id`** (not `main`): `listAnsweredQuestionHistoryForUser`
now derives `topic` via a left join from `questions.topicId` to `topics.name.en` instead of reading
the old column - same return shape (`topic: string | null`), so `metrics.ts`/`coach-notes.ts`/
`service.ts` needed zero changes. New PGlite integration test proves the join resolves a real topic
name and returns `null` for an untagged question. `pnpm typecheck`/`lint`/`test` all clean (1790
tests). **Not yet merged** - waiting for review, then merge + deploy to `main` before the actual
`questions.topic` drop migration can be prepared. Once that's confirmed live, the read-only check
gets re-run and the drop migration follows on its own branch, per the standard destructive-migration
ordering rule.

## 2026-09-28 — Phase 5 audit fixes: D51 cap-race closed, seed scripts no longer auto-publish

Applied the `/phase-audit 5` fix list (daily-cap concurrency race fixed with a locked transaction,
attempts now expire once their edition's IST day has passed, `finish`'s rate limit now fails
closed, `startAttempt`/`submitAnswer` now log activity, the News Desk permission-visibility gap
fixed, the advice-language heuristic extended to AI-drafted questions) - see the commit on
`phase-5-news-pulse` for the full account. One follow-up finding from that audit's guard sweep is
closed out here:

**`scripts/seed-mentors.ts` and `scripts/seed-worlds.ts` no longer insert learner-visible content.**
Both previously inserted their rows with `status: "published"` directly, with no staff actor -
safe today only because nobody has run either script against production, but a real risk since
preview and production share one database (CLAUDE.md rule 6). Fixed by seeding as `"draft"`
(the schema's own default - `status` is no longer set explicitly at all) rather than adding a
"only auto-publish outside production" check: a `DATABASE_URL` mis-pointed at production would
silently defeat a prod-detection check, but a draft row can't be fooled that way - it always needs
a real staff publish action, in every environment, no matter which database the script runs
against. `seed-worlds.ts`'s mentor-must-already-be-published check was also relaxed to
mentor-must-exist, since that dependency is already correctly enforced at actual publish time by
`publishWorld` (`src/server/worlds/service.ts`) - the seed script no longer needs to duplicate it.
`logActivity` calls changed from `mentor.published`/`world.published` to `mentor.created`/
`world.created`, matching what a real draft-creation actually is.

**Checked every other seed script for the same pattern** (`seed-funds`, `seed-instruments`,
`seed-market-holidays`, `seed-reward-rules`, `seed-settings`, `seed-super-admin`, `seed-roles`,
`seed-topics`): none of them have a draft/published concept at all - instruments/holidays are
explicitly "no draft/publish split" content (per `scripts/seed-roles.ts`'s own permission
descriptions), and reward rules/topics use a plain `active` boolean with no review workflow, by
design. **`seed-legal-documents.ts` was deliberately left seeding as published, not converted**:
unlike mentors/worlds (where the app degrades gracefully with zero published rows - a learner just
sees an empty list), onboarding cannot complete at all without a published `terms`/`privacy`/
`risk_disclosure` document for every user, in every environment, including local dev - converting
it to draft would make onboarding unusable out of the box after a fresh migration. Its seeded
content is already unambiguously marked `[PLACEHOLDER — NOT FOR LAUNCH]` in the text itself, is
its own separately-tracked pre-launch checklist item (real text after outside legal review), and
`isPlaceholder: true` is already stored on the row - a materially different risk shape from
AI-drafted or editorial content silently reaching a learner. Flagging this exclusion explicitly
rather than applying the same change quietly.

**Important: this only changes future script runs.** The mentors/worlds already seeded in the
shared database (Baby/Father/Grandpa Lamma, the 7 worlds) were seeded under the old script and are
**already published** - this fix does not retroactively unpublish or touch them. Re-running either
script against the same database is still a no-op for those existing rows (both scripts skip a
key/order that already exists), so nothing changes for the current environment; the fix only takes
effect the next time either script creates a genuinely new mentor or world.

`pnpm typecheck` clean. Neither script is imported by any test (they're standalone, run via
`pnpm seed:mentors`/`pnpm seed:worlds`), so no test changes were needed.

## 2026-09-28 — Phase 5 kickoff: news-source licensing research (D50 blocker), Checkpoint 1 (schema) merged to branch

**News-vendor licensing check, before writing any ingestion code**: checked actual ToS text (not
marketing pages) for Finnhub, NewsData.io, GNews, NewsAPI.org and Marketaux against the exact use
case Phase 5 needs - ingest headlines/summaries, have an LLM rewrite them into our own simplified
text, display that in a paid commercial app aimed at minors, with attribution. Every source with an
explicit commercial-use clause restricts free-tier use to personal/non-commercial/dev-only (Finnhub's
free tier separately bans redistributing "derived results" to any 3rd party, which showing a
rewritten headline to our own users is); NewsData.io's actual terms page could not be fetched (JS-
rendered, 3 attempts) despite a marketing claim that free-tier commercial use is fine; none of the
five explicitly says whether an LLM paraphrase with attribution counts as "redistribution" at all -
that's the one open question a vendor's own written reply needs to close, not more ToS-reading.
Recorded as **D50** in `docs/ARCHITECTURE.md` (blocking): **real news ingestion stays off** until a
vendor confirms this in writing; Phase 5 is built entirely against `MockNewsProvider`
(`src/server/news/providers/mock.ts`), same precedent as D38/D39's `MockMarketDataProvider` for
Twelve Data - every checkpoint is fully buildable/testable on fixture data, so the licensing gap
blocks only the final real-vendor cutover, never development. Two outreach emails drafted (NewsData.io,
GNews) asking directly whether their paid tier covers this exact flow - sent by the founder, not
tracked here since email isn't something this session can do.

**Follow-up research: official/public-domain Indian sources (RBI, SEBI, PIB, NSE/BSE,
data.gov.in/GODL), checked as a possible free alternative or supplement.** Findings: licensing
splits cleanly by content type, not by "official vs. commercial" - the *structured/numeric* sources
(data.gov.in, MOSPI data routed through it) sit on **GODL** (Government Open Data License - India,
gazette-notified 2017), which explicitly permits commercial use and derivative works with
attribution - genuinely low-risk. The *narrative* official sources are exactly the weak ones: RBI's
site states no reuse grant at all (all-rights-reserved, no license language found); SEBI permits
reuse only after emailing them for prior permission each time; NSE explicitly forbids altering
content at all (rules out an LLM rewrite by definition) and restricts to non-commercial/personal
use; BSE flatly prohibits reproduction. Only **PIB** (Press Information Bureau) gives an
unconditional "reproduce freely, attribute the source" grant for narrative text - but PIB's
finance/economy coverage is a subset of a general government-announcement firehose, not a dedicated
financial desk, and none of RBI/SEBI/PIB update on a guaranteed daily cadence the way a "what
happened in markets today" feed needs. **Conclusion: supplement, not a standalone feed** - PIB
(finance-tagged items) + data.gov.in/GODL datasets (CPI, inflation, RBI statistics) are good free
raw material for stat cards / an inflation tracker / an occasional PIB-sourced simplified story, but
the daily narrative backbone still needs a licensed commercial source once one clears D50's
question. A follow-up email to RBI/SEBI could still turn their ambiguous cases into a clean yes/no
cheaply, given RBI content specifically (repo rate changes) is high-value financial-literacy
material - not done yet, flagged for the founder.

**Checkpoint 1 (schema) built, migrated, and pushed to `phase-5-news-pulse`** (not yet merged to
`main`): new admin-editable `topics` table (seeded from the prototype's actual `TOPIC_MAP`, 6
topics), `questions.topicId` FK (old free-text `questions.topic` column left in place, unread,
empty in production - confirmed via a direct query before deciding no backfill was needed; dropped
in a follow-up migration only after this phase deploys to `main`, per CLAUDE.md rule 8), and the
full news_raw/news_stories/news_editions/news_reads/news_desk_picks/pulse_check_attempts/
pulse_check_answers schema. `pnpm typecheck`/`lint`/`test` all clean (1643 tests). Migration A
(additive-only) applied to the real database; Migration B (drop `questions.topic`) is the deferred
follow-up.

## 2026-09-27 — Phase 4 merged to `main` and verified in production. D37 (paise migration) fully complete. Next: Phase 5.

`phase-4-trading-engine` merged into `main` via merge commit `d220e80` (instruments, market data,
orders, mutual funds/SIPs, the market relay, the Profile Trades tab, the Ops console), after
`/phase-audit 4` below passed with its 5-item fix list applied pre-merge (race-condition fix D49,
rate limiting on order/fund-order/SIP endpoints, per-IP relay-config rate limiting, `pnpm contract`
publish, stale advisor-count/FEATURE_MAP doc corrections). `/publish-contract` bumped the API to
**v1.0.0** - the contract's first breaking change, since D37's paise rename
(`balance`/`weeklyEarned`/`weeklySpent`/`earnedThisMonth`/`amount` → `*Paise`, ×100) on
`GET /me/stats/vmoney`, `GET /me/wallet` and `GET /me/wallet/history` had never been published
before this (safe to rename outright - no app has shipped against the old names yet).

**Production, verified post-merge against `https://finlamma-backend-rho.vercel.app`:**
- `GET /api/v1/health`: `version` is `d220e80`, matching the merge commit exactly. `database`,
  `migrations`, `storage`, `redis`, `consentPiiHmacKey`, `clerkKeys`, `relaySecret`, `tradingHalt`
  all `ok`. `market: "mock"` and `inngest: "unconfigured"` are expected, pre-existing states
  (Twelve Data tier not yet picked, D38/D39; `INNGEST_SIGNING_KEY` not yet set), not caused by this
  merge. `legalDocuments: "placeholder"` is the same pre-existing, tracked pre-launch item as every
  prior phase's verification.
- `GET /api/openapi.json`: `200`, `info.version` is `1.0.0`, 50 paths.
- Every new trade endpoint (`POST /trade/orders`, `/trade/funds/orders`, `/trade/funds/sip`,
  `GET /trade/funds/sip`, `/trade/instruments`, `/me/portfolio/summary`) returns `401` signed out,
  never `404` - routing confirmed live.
- `/admin/ops` and `/admin/instruments` `307`-redirect to `/admin/sign-in` signed out. `/` returns
  `200`.

**Migration B (drop `vmoney_ledger.amount`) - D37 fully complete.** Before writing it, confirmed
read-only that no route/service/repo on `main` reads, writes, or full-row-selects `amount` - every
real query already used an explicit column list or aggregate that never included it (the exact
class of check the mentor-columns incident, CLAUDE.md rule 8, exists to enforce). Ran directly
against production via the Supabase SQL Editor as one transactional block (`ALTER TABLE ... DROP
COLUMN` + the matching `drizzle.__drizzle_migrations` tracker row), generated byte-for-byte via
`pnpm db:generate` rather than hand-written, with the tracker row's `hash`/`created_at` computed
the same way Drizzle's own migrator does (SHA-256 of the migration file, the journal's generation
timestamp) - verified by hashing the previous migration and confirming it matched the already-live
row exactly. The code-side sync (schema no longer declares `amount`, the generated migration file/
journal/snapshot, `docs/DATA_MODEL.md` updated) went through its own branch
(`chore-drop-vmoney-amount`, merge commit `783da24`) so the DDL and the repo never diverged for
longer than necessary, applied in the safe order (DDL first, since nothing live depended on the
column either way; code-sync commit after, so `migrations` never briefly showed "pending"/503).
Post-merge, confirmed the migrations table matches the repo exactly (36 rows = 36 journal entries,
latest hash/timestamp identical) and that production health still reports `version: "783da24"`,
`migrations: "ok"`, everything else unchanged.

**Phase 4 is fully verified end to end and closed, D37 has no remaining follow-up.** Next up:
Phase 5, per `docs/ROADMAP.md`.

## 2026-09-26 — Phase 4 Checkpoints 6-8 shipped (LIMIT matching/EOD cancel, Profile Trades tab, mutual funds)

Three checkpoints landed today on `phase-4-trading-engine`, each committed/pushed separately:

- **Checkpoint 6** (D42): `limitOrderMatchingJob` (every minute during market hours) and
  `limitOrderEodCancelJob` (15:30 IST close, skips market holidays) - 8 new tests.
- **Checkpoint 7** (D43/D44): `GET /me/portfolio/summary`/`stats`/`trades` (Profile Trades tab) -
  two additive columns (`orders.realized_pnl_paise`, `holdings.position_opened_at`) - 34 new tests.
- **Checkpoint 8** (D45/D46): mutual funds. 9 fictional Finlamma-branded funds, each internally
  tracking a real AMFI scheme code (fetched live while building this, not guessed) that is never
  surfaced in any API response - verified directly against the generated `openapi.json` (zero
  occurrences of the scheme code). No star rating, no AUM (dropped after a compliance review - a
  kid-facing app showing a real AMC's fund name/rating/NAV risks SEBI advertising/distribution
  rules and uses a real company's trademark and performance with no relationship to them). AMFI
  NAV daily-ingestion job, fund buy/sell (`POST /trade/funds/orders`), SIP plans with a daily
  execution job (idempotent per plan+due-date; a failed execution due to insufficient balance is
  persisted and visible via `GET /trade/funds/sip`, a deliberate narrow exception to the "never
  persist a rejected order" rule stock orders use, since a SIP runs unattended). NAV staleness
  threshold is 4 days (tightened from an initial 7-day proposal per founder review). 80 new tests.
  **Blocking pre-launch checklist item added**: legal review of the whole mutual-fund simulation
  (naming, real AMFI NAV data, SEBI rules, whether tracking a real scheme is permissible at all) -
  not yet reviewed by counsel.

**A real bug caught while building Checkpoint 8**: `getLatestNav` initially always queried the
module-level `db` even when called from inside a row-locked transaction - on PGlite's single
connection this deadlocked the test suite outright (every test after the first fill attempt timed
out at exactly 5s). Fixed by giving it the same `DbOrTx`-accepting signature every other
read-inside-a-transaction function in this codebase already uses - see D46 for the full account,
kept as a standing reminder for any future read added inside a money-moving transaction.

**Full suite, run to genuine completion after each checkpoint**: 134/1447 (Checkpoint 6) →
139/1489 (Checkpoint 7) → 150/1569 (Checkpoint 8), all passing, `pnpm typecheck`/`pnpm lint`/
`pnpm contract` clean throughout.

**Also fixed today, unrelated to the phase's features**: the recurring stray `/loop` wakeup the
founder had reported twice was traced to this session's own `ScheduleWakeup` calls made while
polling a long-running background test command - the harness already sends an automatic
notification the moment a background command finishes, so that polling was always redundant, and
at least one scheduled job didn't get cleaned up and kept firing afterward. Found and deleted via
`CronList`/`CronDelete`; confirmed no hook, skill or settings file schedules anything. Going
forward this session stops scheduling wakeups to poll self-started background work.

## 2026-09-26 — Resolved: full suite ran clean, `orders/repo.test.ts` confirmed against real Postgres

Closes both action items below (the Checkpoint 3 "targeted tests only" note and the Checkpoint 5
PGlite-OOM escalation). After a machine restart freed RAM (~4.6GB free of 12.4GB, up from ~1.9-2.5GB),
both were re-run to a genuine, clean completion:

- `npx vitest run src/server/orders/repo.test.ts` alone: **19/19 passed** - idempotency (replay +
  conflict), halts/pause, market-hours (closed/weekend/holiday), price staleness (including the
  exact 60s boundary) and unavailability, margin/holdings checks, weighted-average holdings math
  across multiple buys, the D37 buy-then-sell round-trip invariant, and LIMIT price-improvement +
  non-marketable queuing - all proven against a real Postgres instance (PGlite), not mocked.
- Full `pnpm test`: **134 test files passed, 1447 tests passed, 0 failures**, `check-test-count.mjs`
  floor check OK (1447 vs. floor 890). No crash, no flake, no failing test anywhere in the suite.

**Root cause confirmed as purely environmental**, not a code defect: identical PGlite crashes
happened on completely unrelated, previously-green files under low system memory, and disappeared
entirely once free memory rose after the restart. No code change was needed.

## 2026-09-25 — PGlite-backed tests unrunnable on this machine right now (escalation of the Checkpoint 3 note below) — RESOLVED 2026-09-26, see above

Worse than the Checkpoint 3 slowdown: `src/server/orders/repo.test.ts` (Checkpoint 5's core
money-safety integration test - idempotency, halts, market hours, price staleness, margin/
holdings checks, the paise-exact buy/sell round trip) crashes with a V8 "Fatal process out of
memory: Zone" error before a single test runs - during `createTestDb()`'s migration step, every
single attempt (6+ retries: with/without fake timers, `NODE_OPTIONS=--max-old-space-size=4096`,
`--no-file-parallelism`, waiting several minutes between attempts). **Confirmed environmental, not
a code bug**: re-ran `src/server/trading/repo.test.ts` and `src/server/economy/repo.test.ts` -
both previously green this session, both completely unrelated to the orders domain - and they now
crash identically. `tasklist` shows zero lingering node/esbuild processes; system free memory is
~2.4GB of 12GB with nothing of mine running. Something outside this session (another application on
the machine) is holding the bulk of the RAM.

**What this means for Checkpoint 5**: `src/server/orders/repo.ts` (the actual transaction logic -
row locking, idempotency, halts, market hours, price staleness/availability, margin/holdings
checks, weighted-average holdings math, the ledger write) has NOT been confirmed against a real
Postgres this session. What HAS been confirmed: `pnpm typecheck` (whole codebase, clean), and every
test that doesn't need PGlite - `src/server/orders/pricing.test.ts` (pure marketability/fill-price
math), `src/server/orders/service.test.ts` (status-to-AppError mapping, activity logging), and
`src/app/api/v1/trade/orders/route.test.ts` (25 tests total, all green). The repo-level integration
test itself is written and type-checks correctly (`src/server/orders/repo.test.ts`) - it simply
could not be executed this session.

**Action item, blocking a real merge of this phase: run `src/server/orders/repo.test.ts` (and the
full suite) to a clean, real completion once this machine has memory available**, and treat any
failure there as load-bearing - this is money-movement code, and typecheck alone does not prove
the transaction logic is correct under real Postgres constraint enforcement.

## 2026-09-25 — Phase 4 Checkpoint 3 shipped on targeted tests only, not the full suite — RESOLVED 2026-09-26, see top entry

`pnpm test`'s full run stalled badly on this machine under real memory pressure (~1.9GB free of
12GB) - a suite that normally finishes in ~230s was still running after 20+ minutes with zero
failures in the ~18 files it had completed, and a second attempt (after killing the first) hit the
same wall. Rather than block indefinitely, Checkpoint 3 (market status, `getTradingUnlockProgress`,
`MockMarketDataProvider`, `GET /api/v1/health`'s `market` field) shipped on the strength of:
- `pnpm typecheck` (whole codebase) - clean, confirmed twice after the Checkpoint 3 changes.
- A targeted run covering every file touched this session (trading, market, economy/paise, worlds,
  badges, rewards, health, wallet/vmoney-stats routes) - 28 files, 344 tests, all green.
- The full suite's own progress up to the point it was killed - zero failures in every file it did
  complete, none of which were files this session touched.

**Action item, not yet done: run `pnpm test` to a real, clean completion (ideally with other
memory-heavy applications closed first) before the next `/phase-audit`, and report the actual
file/test count** - targeted runs are strong evidence but aren't a substitute for the real
`posttest` gate (`scripts/check-test-count.mjs`'s floor check), which only runs as part of a full
`pnpm test` invocation.

## 2026-09-25 — Decided: `users.bio` is never shown to other learners, ever (D36)

Follow-up to the `/phase-audit 3b` finding below (bio's own schema comment said "never shown on
any public profile," but `docs/FEATURE_MAP.md` row AR-20 - Arena's Phase 6 public player profile -
had `bio` listed as a field shown to *other* learners, a real, unfixed contradiction). Decided:

- **Free-text `bio` is never shown to other learners, now or ever.** `users.bio` stays private to
  the owner, `GET`/`PATCH /me` only. Recorded as `docs/ARCHITECTURE.md` D36.
- **AR-20's public player profile (Phase 6) is corrected**, not built: display name (first name +
  last initial), level, rank title, badges, stats - and a set of **preset "about me" chips** picked
  from an admin-managed catalog, never free text. `docs/FEATURE_MAP.md`'s AR-20 row and
  `docs/ROADMAP.md`'s Phase 6 scope both updated to the chip design; nothing built yet.
- **Reasoning**: free text authored by a minor and shown to other minors is a real child-safety
  risk (contact details, school names, a grooming vector) that contradicts this app's existing
  kid-safe rules (no photos, no chat between users, kid-safe display names only - CLAUDE.md rule
  10). Sustained human moderation of child-authored free text isn't a realistic pre-launch
  commitment; a fixed, admin-curated chip list gives a learner real personality with zero ongoing
  moderation burden.
- **The schema comment is now the settled rule, not an aspiration** - `src/server/users/schemas.ts`'s
  `BioSchema` and `docs/DATA_MODEL.md`'s `users` bullet both point at D36 explicitly, so any future
  reader of either file sees this was decided, not just phrased that way once and left unenforced.
- **Pre-launch checklist item added**: "Confirm no learner-authored free text is ever rendered to
  another learner" - re-check specifically when AR-20 ships, and for any future feature that
  surfaces one learner's content to another.

No code behavior changes today - `bio` was never actually wired into any public-facing view, so
this decision locks the design before Phase 6 builds AR-20 the wrong way, rather than fixing a live
bug.

## 2026-09-24 — `/phase-audit 3b` complete: 2 Medium + 3 Low fixes applied, ready to merge

Audited every commit on `phase-3b-daily-engagement` since it diverged from `main`
(`88e6ba2`..`31acd58`, 12 commits: Inngest bootstrap, `users.bio`/`preferences`, Profile Overview
extension, certificates, session-time, daily goals, badges & rewards, the weekly report card +
parent weekly-report opt-in, and the Inngest local-dev-mode fix). Full report covered ROADMAP/
FEATURE_MAP cross-check, code health (typecheck/lint/test/build), database state (migrations,
schema drift, RLS, security advisors - all via the Supabase MCP, read-only), API surface,
production checks against the live deployment, a dedicated `security-auditor` subagent pass, and
docs-vs-reality.

**Result: no Critical/High findings, 2 Medium + 3 Low, all now fixed:**
- **[Medium, money integrity - fixed]** Badge unlock and its V Money credit were two separate,
  non-atomic writes (`src/server/badges/service.ts`): if the VM credit failed after the badge
  award already committed, the badge showed unlocked forever with no VM ever paid, and the next
  evaluation run skipped it (already-unlocked) with no retry path. Fixed by wrapping both writes
  in one transaction (`awardBadgeAndCreditVmoney`, `src/server/badges/repo.ts`), the same shape as
  `creditLessonCompletionRow`. `creditVmoney` (`src/server/economy/service.ts`) is removed - badge
  unlocks were its only caller. Covered by a new PGlite test that injects a failure between the two
  writes and proves the badge award rolls back with it (real Postgres rollback, not a mock).
- **[Medium, minor privacy - fixed]** Account deletion (`anonymizeUserFromClerk`,
  `src/server/users/repo.ts`) cleared email/phone/name/date-of-birth but never `users.bio` -
  free-text, up to 280 chars, self-editable, so a kid's real name/school/handle typed into it
  would survive deletion indefinitely. Fixed: `bio: null` added to the anonymize write, covered by
  a new test. **Follow-up decision needed before Phase 6, not fixed here**: `bio` is currently
  self-only (never read outside `GET/PATCH /me`, confirmed by reading every reference to it in the
  codebase) and its own schema comment says "never shown on any public profile" - but
  `docs/FEATURE_MAP.md` row AR-20 (Arena, Phase 6) already plans to show `bio` on a public player
  profile bottom sheet opened by *other* learners. That's a real conflict: free text with no
  content moderation, shown to other kids, on a kid-safe app. Needs a founder decision (moderation
  pipeline, or drop free text for a curated safe-choice list) before AR-20 is built - flagged here,
  not decided by this audit. `users.preferences` has no free text (booleans only, no exposure
  concern) and no other learner-authored free-text field exists yet.
- **[Low, doc drift - fixed]** `openapi/openapi.json`'s `health.inngest` field description was
  stale (the code's description text changed in the Inngest dev-mode fix commit, contract never
  regenerated after). Fixed: ran `pnpm contract`, committed.
- **[Low, doc drift - fixed]** `docs/DATA_MODEL.md` didn't document `session_time_daily` or
  `parent_contacts`' two new weekly-report columns. Both added.
- **[Low, informational - fixed]** `src/server/users/service.ts`'s `deleteMe` comment said "needs
  Inngest, not yet set up in this phase, revisit once Inngest exists" for a known Clerk/DB
  deletion-reconciliation gap - Inngest now exists (this same phase) but the gap was never
  revisited. Added a ROADMAP ticket (Phase 7: "Clerk/DB account-deletion reconciliation Inngest
  job") and pointed the comment at it instead of the stale "not yet set up" framing.

**FEATURE_MAP.md Status column updated** for 25 rows this phase actually delivers: PR-04..09
(session-time/streak/lessons/quiz-accuracy/dot-calendar/daily-goals quick stats, via the extended
`GET /me/profile/overview` + `GET /me/daily-goals`), PR-12 (efficiency score, partially - surfaced
via the report card, not a standalone `/me/profile/stats`), PR-16..24 (badges + rewards + wallet),
PR-30..38 (report card + certificates; PR-34 partially - reuses `/me/wallet/history` rather than
being embedded; PR-35 partially - the parent-email half is built, PDF/story-card export is
deferred), SET-08..10 (sound/haptics/data-saver/bio), SET-22 (extended note on the weekly-report
opt-in), WH-14 (stale row predating this phase, caught while auditing - `reward_rules` + per-lesson
override were already built in 2b/3a, never marked here).

Production check note: `GET /api/v1/me/badges`/`report-card`/etc. correctly return 404 (not 401)
against the live deployment, since `main` doesn't have Phase 3b yet - re-verify these return 401
without a token once merged. `GET /api/v1/health`'s `version` field matched `origin/main`'s commit
exactly (`83b4722`) at audit time, confirming production was current with `main`.

## 2026-09-23 — `/phase-audit 3a` complete: 2 Low fixes applied, ready to merge

Audited every commit on `phase-3a-economy-core` since it diverged from `main` (`8ff65b0`..`28f4b8b`,
14 commits: rate limiting, the economy ledger, Story/Doubt Zone completion, streaks, stat
endpoints). Full report covered ROADMAP/FEATURE_MAP cross-check, code health (typecheck/lint/
test/build), database state (migrations, schema drift, RLS, security advisors - all via the
Supabase MCP, read-only), API surface, production checks against the live deployment, a
dedicated `security-auditor` subagent pass, and docs-vs-reality.

**Result: no Critical/High findings, 2 Low + 1 Informational, all now addressed:**
- **[Low, reliability - fixed]** `recordStreakActivity`'s first-ever-activity insert
  (`src/server/streaks/repo.ts`) didn't use `onConflictDoNothing`, unlike every other insert
  added this phase - a race on a user's very first streak activity could throw an unhandled
  unique-violation and surface a 500, even though the XP/VM credit itself had already committed
  correctly. Fixed with the same `onConflictDoNothing` + re-read pattern
  `startLessonProgress` (`src/server/lesson-progress/repo.ts`) already used. Covered by two new
  tests: a concurrent-Promise.all regression guard, and a deterministic test of the exact
  onConflictDoNothing mechanism the fix depends on (real concurrent interleaving can't be forced
  against PGlite's single connection - see the test file's own comment).
- **[Low, defense-in-depth - fixed]** `/admin/settings` gated page entry on `settings.manage`,
  but the reward-rules/VM-multiplier editors it renders actually require the stronger
  `economy.manage`. No live gap today (both are `super_admin`-only per `scripts/seed-roles.ts`),
  but fixed anyway so a future role split can't silently show live money controls that fail on
  submit. `page.tsx` now checks `roleHasPermission(staff.roleId, "economy.manage")` and only
  renders those two editors when true; the server actions' own permission checks are unchanged
  (defense-in-depth, not the real gate). Covered by a new `page.test.tsx` (Server Components are
  plain async functions returning a React element tree - testable directly with Vitest, no DOM
  needed).
- **[Informational - documented]** `lessons.xpOverride`/`vmOverride` exist and are already
  trusted by `creditLessonCompletion`, but no editor UI exists yet. Noted in `docs/DATA_MODEL.md`
  and the `admin-page` skill (new item 8) so whoever builds that editor routes it through the
  same bounds-checked, staff-only pattern `reward_rules` already uses, rather than inventing a
  second convention.

**FEATURE_MAP.md Status column updated** for the rows this phase actually delivers: WH-02/03/04
(streak/VM/XP tiles) → Built, PR-01 → Partially built (percentile deferred to Phase 6, avatar/
handle never v1 concepts), PR-02 → Built, TR-52 → Built (with a note that its API-endpoints
column is stale - implemented as a Server Action per D16, not the REST route named there).
Everything else FEATURE_MAP tags Phase 3 (badges, rewards, certificates, report card, daily
goals, PR-04 onward) is Phase 3b, explicitly deferred per this session's 3a/3b split - not
audited as a miss here.

Production check note: the 3 new Checkpoint 5 endpoints return 404 (not 401) against
`https://finlamma-backend-rho.vercel.app` - expected, since `phase-3a-economy-core` isn't merged
to `main` yet (`health.version` = `3b0d147` = `origin/main` HEAD exactly). **Re-verify as 401,
not 404, once merged.**

`pnpm typecheck`/`pnpm lint` clean, `pnpm test` clean run alone (985+ tests - an earlier run
showed 8 worker crashes, traced to running `pnpm test` and `pnpm build` concurrently on Windows,
not a real failure), `pnpm build` exit 0. All 24 migrations applied and match the repo exactly;
zero schema drift across all 25 tables; RLS enabled with 0 policies everywhere; Supabase security
advisor shows only the expected `rls_enabled_no_policy` INFO-level findings.

## 2026-09-23 — Phase 3a Checkpoint 5 (stat endpoints) built; Phase 3a complete pending merge/audit

Two fixes done first, per founder feedback on Checkpoint 4's safeguards:
- `tests/min-count.json`'s floor lowered from 902 (an exact match to the count at the time) to
  890, with the `note` field rewritten to say why: the floor exists to catch a bulk accidental
  loss (like the incident below), not to force a commit-time bump for every small deliberate
  test removal.
- Streak read staleness bug found and fixed - see `docs/ARCHITECTURE.md` D31. The write path
  (D30) was already correct (no retroactive freeze stacking, proven with a new explicit 10-day-
  gap test); the read path (`GET /me/stats/streak`) was not - it echoed the stored row as-is, so
  a learner silent for 10+ days would see their old streak number until their next real activity
  happened to recompute it. Fixed with a shared pure decision function used by both paths.

Then Checkpoint 5 itself - `docs/ARCHITECTURE.md` D32 has the full design. Summary: level is
always derived from `xp_events` via an admin-editable curve (`settings_kv.level_curve`, base 300/
step 100), never stored; a new `rank_titles` table (admin-editable, keyed on level, not
hardcoded) supplies Profile's rank title; V Money balance is summed live from `vmoney_ledger`,
same as it always has been. Three new endpoints: `GET /me/stats/xp` (WH-04), `GET
/me/stats/vmoney` (WH-03), `GET /me/profile/overview` (PR-01/PR-02) - all `requireFullAccess`,
self-only, tested including a zero-activity user (level 1, 0 XP, 0 balance, no rank title).
Percentile/rank omitted outright (not stubbed) - deferred to Phase 6's Arena leaderboard
snapshot, as already planned in `docs/FEATURE_MAP.md`.

**Known limitation: `pnpm db:migrate` cannot reach the database from this machine/network -
use the Supabase SQL Editor for migrations until resolved.** `pnpm db:migrate` hung
indefinitely (not just slow - confirmed hung after a 2-minute attempt, a 5-minute attempt, and a
third attempt with this session's sandboxing fully disabled, ruling out a sandbox-specific
network restriction) trying to apply the new `rank_titles` table migration
(`drizzle/0023_deep_champions.sql`, purely additive - one `CREATE TABLE`) against
`DATABASE_URL_DIRECT`. Root cause not fully confirmed, but the symptom matches Supabase's
**direct connection (port 5432, `db.<ref>.supabase.co`) being IPv6-only**, against a network with
no working IPv6 route - a generic `curl` reachability probe from this same environment also
failed for both IPv4 and IPv6 targets, consistent with (though not conclusive proof of) an
IPv6-routing gap rather than something Supabase-side.

**Workaround used**: ran the `CREATE TABLE`/`ALTER TABLE ENABLE ROW LEVEL SECURITY`/`CREATE
UNIQUE INDEX` SQL directly in the Supabase SQL Editor, plus a manually-computed `insert into
drizzle.__drizzle_migrations` row (hash computed locally via the exact sha256-of-file-content
logic `drizzle-orm`'s own migrator uses, then independently re-verified by recomputing it a
second time) so `pnpm db:migrate`/`GET /api/v1/health`'s migration-drift check don't think it's
still pending. Do this for every migration until the connection issue is fixed.

**Recommended fix (not applied - `drizzle.config.ts` still points at `DATABASE_URL_DIRECT`,
pending founder decision)**: switch `drizzle.config.ts`'s `dbCredentials.url` to Supabase's
**Session pooler** connection string (`aws-0-<region>.pooler.supabase.com:5432`, IPv4-compatible,
one stable session per connection - unlike the Transaction pooler). Specifically **not** the
Transaction pooler (port 6543, same host) - that one reassigns the backend connection between
individual statements, which is the exact D13 incident's root cause applied to a different
connection; a multi-statement `db:migrate` transaction is precisely the kind of thing that
failure mode breaks. The Session pooler keeps a stable session (closer to what a direct
connection gives you) while still being IPv4-reachable, which is the actual property migrations
need. **Worth confirming/fixing before Phase 3b or Phase 4 add another migration**, in case this
recurs.

`pnpm typecheck`/`pnpm lint`/`pnpm test` all clean (985 tests, floor 890), `pnpm contract`
regenerated (25 paths, 27 endpoints documented). Not yet merged - stop-and-audit is the next step
per the founder's Checkpoint 5 instruction ("stop after Checkpoint 5, then we audit and merge").

## 2026-09-23 — Incident: a Write call overwrote an existing test file; safeguards added

During Phase 3a Checkpoint 3, a `Write` tool call on
`src/server/lesson-progress/repo.test.ts` was made without reading the file first. The file
already existed (pre-dating Checkpoint 3), so the write silently replaced its entire contents
instead of extending it - deleting all test coverage for `completeLessonProgress`,
`countInProgressLearners` and `countInProgressLearnersByLessonIds` (functions unrelated to
Checkpoint 3, still used elsewhere). `pnpm test` still reported "passing" immediately afterward,
since nothing checked for a minimum test count - the drop (859 tests before Checkpoint 3's other
new tests, vs. 6 new added while 9 were silently deleted) was only caught by noticing `git commit`
labelled the file a "rewrite (66%)" rather than a plain modification.

**Fixed same-session**: the original 9 test cases were merged back in alongside the 6 new
Checkpoint 3 ones (commit `eec5abb`) - 15 total, all passing. `git log --numstat` across the whole
`phase-3a-economy-core` branch was then checked for every other `*.test.ts` file touched this
phase (deletions vs. insertions per file, looking for the same "roughly equal delete/insert"
signature) - confirmed this was the only file affected; every other test file this phase shows
zero deletions (pure additions).

**Safeguards added** (both same-day):
- CLAUDE.md rule 14: never `Write` a test file without reading it first; use `Edit`/append on an
  existing `*.test.ts` file.
- `pnpm test`'s new `posttest` step (`scripts/check-test-count.mjs`) fails the run if the real
  test count (from vitest's own JSON reporter, `tests/.last-run.json`) drops below the floor
  committed in `tests/min-count.json` (currently 869). This is a backstop, not a substitute for
  reading the file first - it only catches a *count* drop, not a rewrite that happens to net the
  same or a higher count. `tests/min-count.json` must be bumped deliberately, in the same commit,
  whenever tests are intentionally removed or consolidated.

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
