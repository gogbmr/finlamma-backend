# Finlamma — Architecture

Three separate projects, built in this order:

1. `finlamma-backend` — Next.js: REST API (`/api/v1`), admin dashboard, public homepage.
2. `finlamma-market-relay` — small always-on Node service for live prices.
3. `finlamma-app` — Expo / React Native mobile app.

```
                ┌──────────────── Clerk (auth, sessions) ────────────────┐
                │                                                        │
 finlamma-app ──┼── HTTPS (Bearer Clerk token) ──► finlamma-backend ──► Supabase Postgres (Drizzle)
   (Expo)       │                                   │  │  │            Supabase Storage (S3 API)
                │                                   │  │  └─► Upstash Redis (cache, leaderboards, rate limits)
                │                                   │  └────► Inngest (jobs: news, orders, streaks, certs)
                │                                   └───────► Finnhub + India news, Anthropic, Resend,
                │                                             Expo Push, RevenueCat webhooks, PostHog, Sentry
                └── Socket.IO (Clerk token) ──► finlamma-market-relay ──► Twelve Data WebSocket
                                                        └─► writes latest prices to Upstash Redis
```

## Three separate projects
Each project is its own git repository with its own `package.json`, dependencies, `.env`,
Claude Code config, tests, CI and deployment. There is **no monorepo, no shared package and
no import or file path across projects**. They only talk over the network:

| From → To | How | Contract document |
|---|---|---|
| app → server | HTTPS REST `/api/v1` | server `docs/API_ENDPOINTS.md` (generated from `/api/openapi.json`) |
| app → relay | Socket.IO `/market` | relay `docs/API_ENDPOINTS.md` (copy kept in app as `docs/RELAY_API.md`) |
| relay → server | HTTPS (instruments, market controls; `X-Relay-Secret`) | server `docs/API_ENDPOINTS.md` |
| server ↔ relay | Upstash Redis key `px:<SYMBOL>:NSE` | both CLAUDE.md files |

- The server generates an OpenAPI 3.1 spec from its Zod schemas, commits it as
  `openapi/openapi.json`, serves it at `GET /api/openapi.json`, and renders
  `docs/API_ENDPOINTS.md` (every endpoint with request and response formats) from it.
- The app downloads the contract **over HTTP** (`pnpm api:sync`), then generates its typed
  client and its own copy of `docs/API_ENDPOINTS.md`.
- Build order: server → relay → app. Each can be built, tested and deployed alone.

## UI reference (read-only, outside all three repos)
`D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI` — the extracted prototype:
all screens' code and assets. The app copies the assets it needs into its own `assets/`.
The server's admin consoles (Ops console, News Desk) are also designed there.

## Key decisions (append new ones at the bottom, never rewrite old ones)
| # | Decision | Why |
|---|---|---|
| D1 | Clerk for auth; our own `users` table keyed by `clerk_user_id`, filled by Clerk webhooks | Identity is hosted; all app data stays in our DB |
| D2 | Staff permissions live in our DB (`roles`, `permissions`, `role_permissions`), not Clerk | Portable, auditable, fine-grained |
| D2a | Two separate Clerk applications (staff vs. consumer), never one. `clerkMiddleware()`/`auth()`/`<ClerkProvider>` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`) are bound only to the STAFF app, since staff are the only ones who ever sign in through a browser on this domain. The mobile app's users are a separate CONSUMER Clerk app (`CONSUMER_CLERK_PUBLISHABLE_KEY`/`CONSUMER_CLERK_SECRET_KEY`), verified directly in `requireUser()` via `@clerk/backend`'s `authenticateRequest()` against a Bearer token — this never touches `clerkMiddleware()`/`auth()` at all | Exactly one Clerk instance ever manages a session cookie on this domain, so there's no handshake/redirect conflict between two instances; kid accounts and staff identities stay fully separated |
| D3 | Drizzle over plain Postgres; no Supabase-only features in core (no RLS as main access control, no Edge Functions) | Later move to AWS RDS is a connection-string change |
| D4 | File storage via S3-compatible API (`@aws-sdk/client-s3`) | Later move to AWS S3 is config only |
| D5 | Live prices: one Twelve Data WebSocket in the relay, fanned out via Socket.IO | API key never ships in the app; credits per symbol, not per user |
| D6 | Trades execute at the price the server reads from Redis, never a client-sent price | Anti-cheat |
| D7 | V Money is a double-entry-style ledger; balances are derived | Full audit trail |
| D8 | Money and prices are integers (V Money units; prices in paise) | No float errors |
| D9 | Timestamps stored in UTC; business rules (streak days, market hours) use Asia/Kolkata | Correct day boundaries |
| D10 | Ad-free status via RevenueCat webhook → `entitlements` table | Razorpay can be added later as another source |
| D11 | News from Finnhub (global) + one India-focused source; AI drafts, humans publish | Coverage + editorial control |
| D12 | Activity logs are append-only; no update/delete, even for super admin | Trustworthy audit |
| D13 | `src/db/client.ts`'s postgres.js pool uses `max: 2` (not `max: 1`), plus `connect_timeout`/`idle_timeout`/`connection.statement_timeout` | **Incident**: with `max: 1`, two queries issued concurrently from one request (e.g. `Promise.all([db.select()..., db.select()...])`) hung *forever* against Supabase's transaction pooler (port 6543) - no error, and `statement_timeout` didn't catch it either, because Postgres itself never saw a problem. Root cause: postgres.js pipelines concurrent queries onto one logical connection, assuming a continuous single backend; Supavisor's transaction mode can reassign the real backend between individual statements, so the client waits forever on a response that was framed for a connection the pooler already moved on from. Confirmed by direct comparison: the same concurrent pair resolved in 50ms over the direct/session connection (no pooler) and in 285ms over the transaction pooler at `max: 2`, but hung indefinitely over the transaction pooler at `max: 1`. `max: 2` gives an accidental concurrent pair its own connection each, avoiding the single-connection pipelining path entirely. The timeouts are separate defense-in-depth, for a connection Supavisor silently drops while this module-scope client sits idle between warm Vercel invocations. Regression-guarded by `src/db/client.test.ts`; reproducible on demand via `pnpm db:verify-pool` against the real database. |
| D14 | Staff join by email invite (Clerk's Invitation API, `publicMetadata` carrying the role id), not by pasting a Clerk user ID. A separate STAFF-app webhook (`/api/webhooks/clerk-staff`, its own `STAFF_CLERK_WEBHOOK_SIGNING_SECRET`) creates the `staff_members` row on `user.created` once they accept, and deactivates it on `user.deleted`. No "pending invite" row is stored in our DB - Clerk's own invitation record is the only pending state | Self-service onboarding without ever exposing a raw Clerk user ID in the UI; deleting someone in the Clerk dashboard also revokes admin access here automatically |
| D15 | A parent's withdraw-consent token (`consent_records.withdraw_token_hash`) never expires - unlike the 7-day consent token, it has no `expires_at` and no lifetime check in `src/server/onboarding/service.ts` | India's DPDP Act requires withdrawing consent to be **as easy as giving it** - an expiring withdraw link would make revocation harder than the always-available consent link, working against that requirement. The token also stays dead-safe if leaked: it can only ever flip a `consented` row to `withdrawn` (never grants access or reveals data - see `withdrawConsentRecord`'s `WHERE status = 'consented'` guard), and a parent who withdraws by mistake can simply re-consent, minting a fresh withdraw token that supersedes the old one in place (`consent_records` is one row per user - confirming overwrites `withdraw_token_hash` unconditionally, so a leaked or old link can never revoke a *newer* consent). Net: a leaked withdraw link is low-harm, so trading off "could theoretically be replayed forever" against "must always work for as long as consent is in effect" favors never expiring it. |
| D16 | Every mutation on the public parental-consent/legal pages (`/consent/*`) and every staff mutation in `/admin` uses a Next.js **Server Action**, never a `/api/v1` REST route - e.g. `confirmParentConsentAction`/`declineParentConsentAction`/`withdrawParentConsentAction`/`approveReapprovalAction`/`declineReapprovalAction` in `src/app/consent/actions.ts`, and `saveLegalDraftAction`/`publishLegalDocumentAction` in `src/app/admin/(dashboard)/legal/actions.ts`. `/api/v1` exists for the mobile app's OpenAPI contract; neither a parent (no Finlamma account to authenticate an API call with) nor a staff member driving the admin UI is an OpenAPI/mobile-app consumer of that contract | This decision was made during Phase 2a but never recorded here until a `/phase-audit 2a` run found `docs/FEATURE_MAP.md`'s API column for the consent/legal rows still describing REST routes (e.g. `POST /api/v1/parent-consent/confirm`) that were never built - documenting it here is what keeps that kind of drift from recurring silently |
| D17 | Phase 2b's lesson/quiz-answer endpoints compute XP (speed bonus, combo, fever mode, per LF-12/LF-22) and store it on `quiz_attempts`/`question_answers`, but **never write to `xp_events` or `vmoney_ledger`** - those tables don't exist until Phase 3. The stored numbers are a display-only preview (what the report card shows), not a credited amount. `quiz_attempts` also stores an `attempt_number` and `is_first_pass` flag per (user, lesson) so that when Phase 3 wires up real crediting, it can apply anti-farming rules and credit each lesson at most once, idempotently, without redesigning this phase's tables | Phase 3 owns the ledger; building it early would mean building `reward_rules`/`vmoney_ledger`/anti-farming logic out of order. Recording the attempt number now, while the scoring code is fresh, is cheaper than reconstructing "was this the user's first clean attempt" later from attempt history alone |
| D18 | Checkpoint 4a/4b's `lessons.content` can reference a question by id (an in-video pop-quiz cue, a quiz/boss_quiz/role_play question list) before the `questions` table exists (Checkpoint 5). Those references are stored as plain UUID-shaped strings; the Checkpoint 4 publish gate validates they're **well-formed UUIDs only** - not that a matching row exists, not that it's published, since `questions` doesn't exist yet to check against. **Checkpoint 5 must close this gap**: once `questions` exists, the lesson publish gate (`publishLesson` in `src/server/lessons/service.ts`) gets a mandatory added check that rejects publishing with a dangling (no matching row) or unpublished-question reference, naming the missing/unpublished reference the same way the mentor/world completeness gates name missing translation fields | Pulling `questions` into 4a to make this checkable now would mean building a meaningful slice of Checkpoint 5's format/payload/answer schemas out of order, just to support a validation that has no real content to validate yet anyway (nobody can author a real question before Checkpoint 5 ships question authoring). Recording the gap explicitly here, rather than leaving it implicit, is what keeps Checkpoint 5 from shipping the `questions` table without also closing the loop back to lesson publishing - the same reasoning as D17 |
| D19 | A `doubt_zone` lesson's content stores `mentorKey` - which mentor persona the scripted Q&A was actually written for - fixed at authoring time, never derived from the world's current mentor. If a world's mentor is later changed (only possible while the world is a draft, which - per the world<->lesson publish dependency, Checkpoint 3/4a - requires every published lesson under it, including any doubt_zone ones, to already be unpublished first), the admin lesson editor compares the stored `mentorKey` against the world's current mentor and shows a warning banner on that lesson ("written for X, world's mentor is now Y - review before publishing") until a staff member either rewrites the script or the mentor is changed back. **No new table, column or migration** - it's a computed comparison in the editor UI, not a persisted "flagged for review" state | Simplest safe option that still surfaces the staleness where staff will actually see it (the editor, right before they'd publish). A persisted per-lesson review-flag column was considered and rejected for v1 - it adds a migration and an admin filter view for a staleness window that can only ever open while the world is already mid-edit as a draft (see the forced unpublish-lessons-first chain above), so the blast radius is small and staff are already in the editor at exactly the moment the warning needs to be seen |

**D15 follow-on rule**: because withdrawal must stay as easy as giving consent (the DPDP
requirement above), **any email sent to a parent/guardian after their consent is recorded must
include the current withdraw-consent link** - not just the one-time consent receipt. Today
(Phase 2a) that's the only such email, so this has no effect yet, but it binds every future
parent-facing email a later phase adds (e.g. a weekly report-card email to a verified parent
contact, Phase 3's PR-35) - see the matching non-negotiable rule in `CLAUDE.md`.
