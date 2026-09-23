# finlamma-backend — Roadmap

Work top to bottom. Tick items as they are finished. Publish the API contract
(`pnpm contract`) at the end of each phase.

## Phase 0 — Project setup
- [x] Next.js (App Router, TS strict, Tailwind, ESLint) with pnpm; Prettier; Vitest
- [x] `src/lib/env.ts` with Zod-validated env; `.env.example`
- [x] Drizzle + Supabase Postgres connection; first empty migration
- [ ] Sentry, PostHog server client (deferred - see Pre-launch checklist; env vars are
      already optional in `src/lib/env.ts` so the app runs without them)
- [x] Error model, `ok()/fail()` helpers, OpenAPI registry, Scalar docs at `/api/docs`
- [x] `scripts/generate-openapi.ts`, `pnpm contract` script, `GET /api/openapi.json` route,
      first `docs/API_ENDPOINTS.md` generated (health endpoint only)
- [x] Health endpoint `GET /api/v1/health`
- [x] Deploy preview on Vercel

## Phase 1 — Identity, roles, activity log
- [x] Two Clerk applications (see docs/ARCHITECTURE.md decision D2): `clerkMiddleware()`/
      `auth()` bound to the STAFF app (the only one that ever holds a session cookie on this
      domain — admin sign-in UI itself is still the admin-shell item below); `requireUser(req)`
      verifies the mobile app's Bearer token directly against the separate CONSUMER app via
      `@clerk/backend`, independent of the middleware
- [x] `activity_logs` (append-only, RLS enabled) + `logActivity()` (moved up: the webhook
      below needs it) — no update/delete path exists for this table anywhere in the codebase
- [x] Clerk webhook → `users` table (created/updated/deleted)
- [x] `roles`, `permissions`, `role_permissions`, `staff_members`; seed roles
      (super_admin, user_manager, content_uploader, content_publisher, quiz_maker)
- [x] `requireStaff(permission)` helper
- [x] Admin shell: layout, sign-in, staff management page, activity log viewer
- [x] `GET/PATCH /me`, account deletion (DB + Clerk)

## Phase 2a — Onboarding, parental consent & legal documents
Do this early — it gates everything else. **Audit and merge to main before starting Phase 2b.**
- [x] Date of birth capture at onboarding; determines under-18 status
- [x] `legal_documents` + `legal_acceptances` (staff-editable, versioned, super_admin-only
      publish, re-acceptance on new versions) for Terms/Privacy/Risk-disclosure, with an admin
      legal-document editor. School/institution accounts are v2, not in v1's legal text.
- [x] `parent_contacts` + `consent_records` for under-18 users. **v1 parent verification is
      email-link only** (no code — a code is trivially self-verifiable by a child with a second
      email — and no SMS). The magic link opens a public consent page (GET never records
      anything; separate "I consent" / "I do not consent" POSTs do); tokens are single-use,
      hashed, valid 7 days, rate-limited to resend. Every email to a verified parent also carries
      a withdraw-consent link (same GET-page/POST-action pattern). The minor's own "I accept" is
      `POST /api/v1/me/legal/accept` (built in the Legal domain) — the actual in-app screen for it
      is a `finlamma-app` (mobile) concern, a separate project per docs/ARCHITECTURE.md, not this
      backend. SMS OTP for parents needs an Indian SMS provider + DLT template registration, so
      it's deferred (see Pre-launch checklist).
- [x] Limited feature access (onboarding, Settings, legal pages only) for an account with no DOB
      yet or an unresolved minor consent — `requireFullAccess(user)`, which every XP/VM/trading/
      social endpoint from Phase 2b onward must call
- [x] Admin: consent/legal-acceptance review view (`consent.view`, `user_manager`, read-only;
      every staff view of a parent's contact details is logged)
- See `docs/PRODUCT_SPEC.md`'s Onboarding & parental consent section for the exact flow.

## Phase 2b — Learning content
- [x] Mentors content type (admin CRUD: name, bio, persona/voice notes, art, per language) —
      unbounded, no fixed count (D25, `docs/ARCHITECTURE.md`); moved here from Phase 3 because
      worlds need a mentor; seed Baby/Father/Grandpa Lamma as a starting set, assigned to worlds
      via `worlds.mentorId`
- [x] Worlds, lessons (6 node kinds), quizzes, questions (all formats). World unlock is
      **sequential only** (clearing the previous world's Boss Quiz) — no XP/level gate; Boss Quiz
      and Role Play reuse the same lesson-flow content shape as Quiz, not separate engines
- [x] Content CRUD in admin with draft → published flow and uploads to storage. `lessons.content`/
      `questions.payload` are authored via a schema-validated JSON editor for v1 (human-readable
      validation errors, a starter template per lesson/quiz format, a publish preview, and cue-
      timestamp-order/video-length checks) — see "Later" section below for the visual builder
- [x] Translations for `en`, `hi`, `hx` on every content field
- [x] Scoring constants (speed-bonus 45% threshold, fever mode combo≥3 → 2×, combo bonus) as
      admin-editable `settings_kv`, seeded from the prototype's exact values. "All-correct bonus"
      is Pulse Check's own mechanic (News, Phase 5), not part of Lesson Flow's LF-12/LF-22
      formula — deferred to that phase, not built here
- [x] "Doubt Zone" node kind ships **scripted** in v1 — fixed Q&A written by the content team per
      lesson, no live AI call. The live AI mentor upgrade is Phase 7.
- [x] App endpoints: world map, lesson detail, submit quiz answers (server-side scoring)

## Phase 3 — Progress economy
- [x] **Rate limiting (Upstash Redis) on the quiz serve/answer endpoints** (`POST
      /api/v1/lessons/{id}/steps/{n}/serve`, `.../answer`), before any real XP is credited to a
      ledger. Flagged by the Phase 2b security audit (`docs/STATUS.md`) - low-impact today since
      XP is preview-only (D17) and each step grades once, idempotently, but a real abuse/
      resource-consumption vector once this phase wires XP to `vmoney_ledger`.
- [ ] XP events, levels, world unlocks
- [x] `reward_rules` (admin-editable default XP + VM per activity kind, seeded per
      `docs/ECONOMY.md`), V Money ledger; XP and VM earned independently (no conversion rate)
- [x] Global VM issuance multiplier (`settings_kv.vm_issuance_multiplier`, default 1.0), recorded
      on every ledger entry
- [ ] Streaks (IST days, `scope`: learning + separate pulse_check) + 2 freezes/month; daily goal
- [ ] Badges and rewards — **Finlamma-only at launch** (badges/titles/cosmetic themes, fixed
      admin-set V Money price each), no brand coupons; `rewards.category` supports adding real
      brand-partner rewards later without a schema change
- [ ] Certificates on world completion — PDF via a browser-free renderer (e.g.
      `@react-pdf/renderer`, not a headless browser — Vercel-compatible), stored in storage,
      shared as a signed URL via the device share sheet (the student sends it, we never do)
- [ ] Weekly report card: `report_snapshots` Inngest job (Monday IST), efficiency score,
      module breakdown, 8-week trend; `coach_note_templates` (admin-editable, draft → publish,
      no AI) — see `docs/PRODUCT_SPEC.md` §6 for the exact formula and template rules
- [ ] `users.bio`, `users.preferences` (sound/haptics/data-saver); Settings screens that don't
      need their own backend (legal pages, contact, rate-app) ship as static/deep-link content

## Phase 4 — Trading engine (needs the market relay for live prices)
- [ ] Instruments table (12 NSE stocks, admin-editable), market holidays, market status
- [ ] Twelve Data REST: quotes and candle history with Redis caching
- [ ] "Explore mode": quotes/charts/watchlist visible to everyone; order pad unlocks per
      `isTradingUnlocked()` (`src/server/worlds/service.ts`, already built in Phase 2b ahead of
      this phase) — position-based (`settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition`,
      default 3rd published world), never a specific world's id/name (D25, `docs/ARCHITECTURE.md`),
      not an XP/level threshold — no starting balance or unlock grant, ever (see `docs/ECONOMY.md`)
- [ ] Orders (market/limit, whole shares only), holdings, P&L; idempotency; halts; margin checks
- [ ] `GET /api/v1/relay/config` for the market relay (X-Relay-Secret): instruments, feed mode, halts, holidays
- [ ] Limit-order matching job (Inngest)
- [ ] Mutual funds: AMFI NAV import job, SIP (tiered minimums: ₹100 index / ₹500 other) + lump sum
- [ ] `instrument_daily_bars` (candle history), indices (NIFTY 50/BANK NIFTY/SENSEX) via the same
      Twelve Data source
- [ ] Ops console: feed mode, halts, trade-unlock-world setting, user ledger with risk flags
      (default rule: NEW = joined <7 days ago; WATCH = >50% of portfolio in one position or >10
      orders in a day; admin-tunable thresholds), live KPI queries (not hardcoded). **No
      volatility control** — closed market always shows the last real close, never a synthetic
      price near a real trade

## Phase 5 — News & Pulse Check
- [ ] Ingestion jobs: Finnhub + India source → `news_raw` (2 sources at launch, not the
      prototype's placeholder "7 partner feeds" figure)
- [ ] AI simplification (3 languages) + jargon term + quiz drafts; auto quality grade (A/B/C,
      staff-overridable) + topic tagging (fixed admin-extensible taxonomy, see DATA_MODEL.md)
- [ ] `news_reads` (backs the read badge), `news_desk_picks` (staff-curated Desk Pick/Exam
      Alert/Scam Watch cards, separate from the algorithmic feed)
- [ ] Pulse Check ships the 9 formats the prototype implements; the unused "PREDICT" toggle is
      dropped for v1
- [ ] News Desk console: review, publish toggle, quiz generator settings, live engagement query
      (not hardcoded), live KPI tiles
- [ ] App endpoints: feed, story, bookmarks, Pulse Check (server-scored)

## Phase 6 — Arena & social
- [ ] Weekly leaderboards (Redis sorted sets), scopes (state scope uses `users.state`, optional,
      collected with an explanation, never shown publicly), leagues with promote/demote job.
      Leagues are a flat pool per scope with computed top/bottom ~25% (matches the prototype) —
      no named tiers (Bronze/Silver/Gold) for v1. Promote/safe/demote reward amounts admin-editable
      via `reward_rules`
- [ ] Worlds table; daily `world_xp_snapshots`/rollup job for the 7-day sparkline; cached
      per-user aggregate stats (lessons/quiz accuracy/sim P&L) for leaderboard row expansion. No
      real-time "LIVE" presence tracking for v1 (cut, low value for the infra cost)
- [ ] Cheers (+5 XP, notification) — one cheer per recipient per sender per day, a daily
      per-receiver XP cap from cheers, un-cheer/re-cheer never re-awards XP
- [ ] Monthly single-stock Competition: isolated virtual capital, ROI%-ranked leaderboard,
      admin-configurable **virtual-only** prizes (V Money / badges / coupons, never real
      currency) — depends on Phase 4's order execution primitives

## Phase 7 — Notifications & Doubt Zone
- [ ] Expo push tokens, notification preferences, streak/boss/news jobs
- [ ] Doubt Zone: streaming AI mentor endpoint with rate limits and minors-appropriate safety
      rules — this is the live upgrade of Phase 2b's scripted in-lesson "Doubt Zone"/"Lamma AI"
      node, and also the standalone Doubt Zone entry point
- [ ] Move bulk parent re-approval emails to an Inngest job, since the synchronous send on
      publish won't scale (Phase 2a's `notifyAffectedMinorsForReapproval` currently emails every
      affected parent inline during the admin publish Server Action)

## Phase 8 — Monetisation
- [ ] RevenueCat webhook → `entitlements`; `GET /me/entitlements`
- [ ] Ad eligibility flag (World 3 completed and not ad-free)

## Phase 9 — Analytics & homepage
- [ ] Admin analytics dashboards (users, retention, lessons, trading, news, revenue)
- [ ] Public homepage, privacy policy, terms, risk disclosure pages

## Pre-launch checklist
- [ ] **Review the 8 unindexed-foreign-key and 15 unused-index Supabase advisor findings**
      (`INFO` level, flagged by the Phase 2b audit, `docs/STATUS.md`) - low-traffic pre-launch
      noise today (e.g. `legal_documents.published_by`, `quiz_attempts.lesson_id`,
      `question_answers.question_id` have no covering index), but worth a real pass once query
      patterns and data volume are closer to production before launch.
- [ ] **Native-speaker review of all Hindi and Hinglish content** (mentors, worlds, lessons,
      questions, emails, consent pages) — the seed/draft copy written during development (e.g.
      `scripts/seed-mentors.ts`'s Hindi/Hinglish bios) is a best-effort approximation, not
      reviewed by a native speaker.
- [ ] **BLOCKING: recreate the production database from migrations + seeds before real users sign
      up** (`docs/ARCHITECTURE.md` D27, decided 2026-09-23) - a fresh Supabase project, or a full
      reset of this one, then `pnpm db:migrate` + the full seed sequence
      (`db:seed`/`seed:super-admin`/`seed:legal`/`seed:mentors`/`seed:worlds`/`seed:settings`/
      `seed:reward-rules`). Necessary because the deliberate decision to keep one shared database
      pre-launch (no separate dev project - see the next item) means every local/preview test
      credit written to the append-only `xp_events`/`vmoney_ledger` tables (D26 - no delete path,
      ever) permanently accumulates in what will become the production database. Check
      `docs/STATUS.md`'s "Test learners recorded so far" list before recreating, to confirm
      nothing real got mixed in with test data in the meantime.
- [ ] **Real-Postgres concurrency test for world reorder**, once a separate dev database exists.
      `src/server/worlds/repo.test.ts`'s concurrent-move tests run against PGlite
      (`src/test/db.ts`), which is a single connection - two "concurrent" `db.transaction()` calls
      there are actually serialized by the driver, not genuinely interleaved, so those tests can
      prove "no corruption" but not "a real race loses cleanly" (see the reorder-fix commit and
      `src/lib/db-errors.ts`'s `isTransactionConflict`). Once a real multi-connection Postgres is
      available outside the shared production database (e.g. a Supabase branch/dev project), add a
      test that fires two genuinely concurrent overlapping `moveWorldToPosition` calls from two
      separate connections and confirms one gets a clean `isTransactionConflict` and neither
      leaves a negative sentinel order behind.
- [ ] **Legal review of the parental-consent flow and the Terms/Privacy/Risk-disclosure text**
      (outside counsel) before launch — see `docs/PRODUCT_SPEC.md` §7
- [ ] **Legal review: retention period for anonymised consent evidence.** Account deletion keeps
      `consent_records` (status, timestamps, accepted legal-document versions, and a
      `parent_email_hmac` proof) indefinitely as evidence consent was once given, even after the
      account and the parent's raw contact details are scrubbed — see `docs/DATA_MODEL.md`'s
      Compliance section. Outside counsel should confirm how long this evidence needs to be kept
      and whether it needs its own retention/deletion policy, separate from the account itself.
- [ ] SMS OTP for parent verification, in addition to Phase 2a's email-only flow — needs an
      Indian SMS provider (e.g. MSG91/Gupshup) and DLT template registration; not required to
      launch, deferred until that provider/registration work is done
- [ ] Create Sentry project, add `SENTRY_DSN` (+ auth token for source maps), wire up
      `@sentry/nextjs` (client, server, edge configs) - deferred from Phase 0
- [ ] Create PostHog project, add `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST`, wire up
      the `posthog-node` server client - deferred from Phase 0
- [ ] Set up Playwright and e2e tests for admin pages (`pnpm test:e2e`) - deferred from Phase 1's
      admin shell; needs browsers installed locally (`pnpm exec playwright install`), which
      wasn't attempted in the sandbox this was built in over a slow connection

## Later (non-blocking — no phase assigned)
- [ ] Visual lesson/quiz content builder for the admin editor, replacing Phase 2b's
      schema-validated JSON editor for `lessons.content`/`questions.payload` (video scene/cue
      timeline, drag-to-order question builder, etc.). Not launch-blocking — the JSON editor with
      human-readable validation, starter templates and a publish preview covers v1's authoring
      needs; revisit once content-team throughput becomes a bottleneck.
