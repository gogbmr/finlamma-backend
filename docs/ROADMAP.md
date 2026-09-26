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
- [x] XP events, levels, world unlocks — `xp_events` (Checkpoint 2), world unlocks (Phase 2b
      Checkpoint 6/D23-D24, built ahead of this phase), level (Checkpoint 5: always derived from
      `xp_events` via an admin-editable level curve, `settings_kv.level_curve`, never stored -
      `src/server/leveling`, D32)
- [x] Stat endpoints: `GET /me/stats/xp` (WH-04), `GET /me/stats/vmoney` (WH-03), `GET
      /me/stats/streak` (WH-02, Checkpoint 4), `GET /me/profile/overview` (PR-01/PR-02) - admin-
      editable rank titles table (`rank_titles`, keyed on level, not hardcoded); V Money balance
      and level both always summed/derived live, never stored columns; percentile/rank
      deliberately deferred to Phase 6 (Arena's weekly leaderboard snapshot), not stubbed (D32)
- [x] `reward_rules` (admin-editable default XP + VM per activity kind, seeded per
      `docs/ECONOMY.md`), V Money ledger; XP and VM earned independently (no conversion rate)
- [x] Global VM issuance multiplier (`settings_kv.vm_issuance_multiplier`, default 1.0), recorded
      on every ledger entry
- [x] Streaks (IST days, `scope`: learning + separate pulse_check) + 2 freezes/month
- [x] Daily goal meter
- [x] Badges and rewards — **Finlamma-only at launch** (badges/titles/cosmetic themes, fixed
      admin-set V Money price each), no brand coupons; `rewards.category` supports adding real
      brand-partner rewards later without a schema change
- [x] Certificates on world completion — PDF via a browser-free renderer (e.g.
      `@react-pdf/renderer`, not a headless browser — Vercel-compatible), stored in storage,
      shared as a signed URL via the device share sheet (the student sends it, we never do)
- [x] Weekly report card: `report_snapshots` Inngest job (Monday IST), efficiency score,
      module breakdown, 8-week trend; `coach_note_templates` (admin-editable, draft → publish,
      no AI) — see `docs/PRODUCT_SPEC.md` §6 for the exact formula and template rules.
      Report card PDF/story-image export (PR-35) deferred — not built this checkpoint.
- [x] `users.bio`, `users.preferences` (sound/haptics/data-saver); Settings screens that don't
      need their own backend (legal pages, contact, rate-app) ship as static/deep-link content

## Phase 4 — Trading engine (needs the market relay for live prices)
Split into 4a (market data + explore mode, no real money movement) and 4b (orders/holdings/funds/
Ops console, money rules - see the VM/paise decision below). Relay repo is out of scope for this
backend's session - this phase documents the contract precisely; the relay itself is built in its
own repo later, hosted on Railway.

**4a**
- [x] Checkpoint 1: `instruments` table (12 NSE stocks seeded), `market_holidays` (2026 NSE
      calendar seeded), `market_controls` singleton row; admin CRUD (`instrument.manage`
      permission, no draft/publish split - edits apply immediately). Halting a symbol and the
      feed-mode/global-halt controls are Checkpoint 9 (Ops console, `trading.ops`), not this
      checkpoint - `instruments.halted`/`market_controls` are readable now, written later.
- [x] Checkpoint 2: Twelve Data REST integration (quotes + `/time_series` candles), Redis-cached
      per symbol+timeframe. `GET /trade/instruments`, `/instruments/{symbol}`,
      `/instruments/{symbol}/candles` built, each carrying a server-driven TR-56 disclaimer.
      Vendor isolated behind `MarketDataProvider` (`src/server/market/types.ts` +
      `provider.ts`) per D38 - a future vendor swap (e.g. an Indian broker API, if Twelve
      Data's NSE tier is too expensive) touches one adapter file, not the trading domain.
      `/trade/indices`, `/trade/indices/{symbol}/candles` deferred to Checkpoint 7 alongside
      `instrument_daily_bars` (no DB row exists for indices yet - not tradeable instruments).
- [x] Checkpoint 3: Market status (`GET /trade/market-status`) - NSE hours 09:15-15:30 IST Mon-Fri
      minus `market_holidays` (`src/server/market/hours.ts`, pure/tested), feed mode, halt state;
      explore mode + `isTradingUnlocked()` wiring (already built in Phase 2b ahead of this phase)
      — position-based (`settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition`, default
      3rd published world), never a specific world's id/name (D25, `docs/ARCHITECTURE.md`), not an
      XP/level threshold — no starting balance or unlock grant, ever (see `docs/ECONOMY.md`). New
      `getTradingUnlockProgress()` (`src/server/worlds/service.ts`) adds the "N worlds to go"
      progress count TR-57 needs on top of `isTradingUnlocked`'s plain boolean. Watchlist = the
      full active-instrument list from Checkpoint 2's `GET /trade/instruments` (no per-user
      watchlist table, decided).
- [x] Checkpoint 4 (stop point - new env vars): `GET /api/v1/relay/config` (`X-Relay-Secret`
      header, constant-time hash comparison against `RELAY_SHARED_SECRET`, rate-limited 30/60s
      fail-closed, generic 401 with no detail) - `TWELVEDATA_API_KEY`/`RELAY_SHARED_SECRET` wired
      into `src/lib/env.ts`; `px:<SYMBOL>:NSE` Redis price-key contract documented precisely in
      `docs/ARCHITECTURE.md` D40 (key format, payload shape, writer/reader, staleness, missing-key
      semantics, relay-side TTL requirement) for the relay repo to build against later. Endpoint
      registered in the OpenAPI registry (tagged `Relay`, no bearer/session security scheme) so
      `docs/API_ENDPOINTS.md` stays complete without it looking like an app-facing route.
      `GET /api/v1/health` gained a `relaySecret` field.

**4b** (money rules - VM/paise migration approved and shipped, D37; founder confirmed and asked to proceed)
- [x] Checkpoint 5: `vmoney_ledger` moved to exact paise (D37, shipped earlier); `orders`/
      `holdings` tables (`drizzle/0032_daily_triton.sql`, additive); `POST /api/v1/trade/orders`
      (MARKET/LIMIT, whole shares only, `Idempotency-Key` required, margin/holdings checks, one DB
      transaction: order → ledger → holdings → activity log, row-locked - D41). Missing price →
      `PRICE_UNAVAILABLE`; stale (>60s during market hours) → `PRICE_STALE`. LIMIT orders outside
      market hours stay OPEN until matched or cancelled at day end (Checkpoint 6).
      `src/server/orders/repo.test.ts` (the PGlite integration test for all of the above) confirmed
      passing 19/19 against real Postgres on 2026-09-26, after an earlier environmental
      machine-memory issue was resolved by a restart - see `docs/STATUS.md`. Full `pnpm test` also
      confirmed clean: 134 files, 1447 tests, 0 failures.
- [x] Checkpoint 6: limit-order matching job (`limitOrderMatchingJob`, every minute during market
      hours) + end-of-day cancel job (`limitOrderEodCancelJob`, 15:35 IST, skips market holidays) -
      both Inngest cron functions, D42. `matchOpenLimitOrderTx` re-evaluates one already-queued
      order per tick (same halt/pause/hours/staleness/margin/holdings checks as `placeOrderTx`,
      but never rejects the order itself - a non-fill just leaves it open for the next tick).
      8 new tests in `src/server/orders/repo.test.ts` (27 total in that file now), full suite still
      clean (134 files / 1447 tests, `pnpm typecheck`/`pnpm lint` clean).
- [x] Checkpoint 7: Profile's Trades tab - `GET /me/portfolio/summary` (cash + holdings value +
      all-time trading P&L + a 12-bar equity sparkline replayed from every fill), `/stats`
      (realized P&L, win rate, avg hold days, best/worst trade), `/trades?status=all|open|closed`
      (cursor-paginated closed trades, open positions always in full on page 1) - D43/D44. Two
      additive columns: `orders.realized_pnl_paise` (SELL fills only) and
      `holdings.position_opened_at` (resets on a 0→positive re-entry). Scope cut: the Trade tab's
      own `/api/v1/trade/account`/`/positions` endpoints (TR-03/10/11) are deferred to that
      screen's own build, not this checkpoint. 34 new tests (31 in the new portfolio domain + 3
      more in orders/repo.test.ts for realizedPnlPaise/positionOpenedAt), full suite still clean,
      `pnpm typecheck`/`pnpm lint`/`pnpm contract` clean.
- [x] Checkpoint 8 (money rules): mutual funds - `funds`, `fund_navs`, `sip_plans`,
      `fund_holdings` (D45/D46). 9 fictional Finlamma-branded funds (never a real AMC's name),
      each internally tracking a real AMFI scheme code fetched live for this checkpoint - never
      surfaced in any API response. AMFI NAV daily-ingestion Inngest job (parses defensively - one
      fund's bad row never blocks the others; executes against the most recent available NAV,
      never requires today's; `NAV_STALE` at >4 days). `POST /trade/funds/orders` (buy/sell,
      Idempotency-Key, same ledger/transaction/idempotency pattern as stock orders); SIP plans
      (tiered minimums ₹100 index / ₹500 other, admin-editable per fund, day-of-month 1-28 only)
      with a daily execution job idempotent per (plan, due date) - a failed execution (insufficient
      balance) is persisted and visible via `GET /trade/funds/sip`, never silently skipped; pause
      (reversible)/resume/cancel (terminal). No star rating, no AUM (dropped per founder review -
      see D45). 80 new tests, full suite still clean, `pnpm typecheck`/`pnpm lint`/`pnpm contract`
      clean.
- [ ] Checkpoint 9: Ops console - feed mode, per-symbol + global halt (`trading.ops` permission),
      trade-unlock-world setting, user ledger with risk flags (default rule: NEW = joined <7 days
      ago; WATCH = >50% of portfolio in one position or >10 orders in a day; admin-tunable
      thresholds), live KPI queries (not hardcoded), audit log. Rolling Redis tick history backs
      the 15-min-delayed feed mode. **No volatility control** — closed market always shows the
      last real close, never a synthetic price near a real trade.
- [ ] `instrument_daily_bars` (candle history), indices (NIFTY 50/BANK NIFTY/SENSEX) via the same
      Twelve Data source (folds into Checkpoint 2/7, not a separate checkpoint)

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
- [ ] Public player profile (FEATURE_MAP AR-20): display name, level, rank title, badges, stats -
      and a set of **preset "about me" chips** picked from an admin-managed catalog, never
      free-text `bio` (`docs/ARCHITECTURE.md` D36 - `users.bio` stays private to the owner
      forever). Needs a chip-catalog admin page and a per-user chip-selection table/column
- [ ] Monthly single-stock Competition: isolated virtual capital, ROI%-ranked leaderboard,
      admin-configurable **virtual-only** prizes (V Money / badges / coupons, never real
      currency) — depends on Phase 4's order execution primitives

## Phase 7 — Notifications & Doubt Zone
- [ ] Expo push tokens, notification preferences, streak/boss/news jobs
- [ ] Doubt Zone: streaming AI mentor endpoint with rate limits and minors-appropriate safety
      rules — this is the live upgrade of Phase 2b's scripted in-lesson "Doubt Zone"/"Lamma AI"
      node, and also the standalone Doubt Zone entry point
- [x] Move bulk parent re-approval emails to an Inngest job, since the synchronous send on
      publish won't scale (Phase 2a's `notifyAffectedMinorsForReapproval` currently emails every
      affected parent inline during the admin publish Server Action). Pulled forward into
      Phase 3b Checkpoint 7 alongside the weekly report card's own Inngest job.
- [ ] **Clerk/DB account-deletion reconciliation Inngest job** (flagged by Phase 2a's security
      review, revisited and still open in the `/phase-audit 3b` security pass): `deleteMe`
      (`src/server/users/service.ts`) deletes the Clerk identity first, then anonymizes our own
      `users` row - if the Clerk delete succeeds but the anonymize write throws, the user is stuck
      mid-deletion (their Clerk identity is gone, so `requireUser()` now fails and they can't
      retry), with only the async `user.deleted` webhook redelivery as a path back to consistency.
      Inngest now exists (Phase 3b Checkpoint 0) - this needs a scheduled reconciliation job that
      finds any `users` row whose Clerk identity is confirmed gone but isn't yet anonymized, and
      finishes the anonymize step for it.

## Phase 8 — Monetisation
- [ ] RevenueCat webhook → `entitlements`; `GET /me/entitlements`
- [ ] Ad eligibility flag (World 3 completed and not ad-free)

## Phase 9 — Analytics & homepage
- [ ] Admin analytics dashboards (users, retention, lessons, trading, news, revenue)
- [ ] Public homepage, privacy policy, terms, risk disclosure pages

## Pre-launch checklist
- [ ] **Confirm no learner-authored free text is ever rendered to another learner** (D36,
      `docs/ARCHITECTURE.md`) - `users.bio` must stay `GET`/`PATCH /me`-only forever; re-check this
      specifically when Phase 6's public player profile (AR-20) ships, and again for any future
      feature that surfaces one learner's content to another.
- [ ] **Review the 8 unindexed-foreign-key and 15 unused-index Supabase advisor findings**
      (`INFO` level, flagged by the Phase 2b audit, `docs/STATUS.md`) - low-traffic pre-launch
      noise today (e.g. `legal_documents.published_by`, `quiz_attempts.lesson_id`,
      `question_answers.question_id` have no covering index), but worth a real pass once query
      patterns and data volume are closer to production before launch.
- [ ] **Native-speaker review of all Hindi and Hinglish content** (mentors, worlds, lessons,
      questions, emails, consent pages, **instrument about/tip copy** — `scripts/seed-instruments.ts`)
      — the seed/draft copy written during development (e.g. `scripts/seed-mentors.ts`'s
      Hindi/Hinglish bios) is a best-effort approximation, not reviewed by a native speaker.
- [ ] **Legal/compliance review of every `instruments.about`/`instruments.tip` field for
      advice-like language** (target prices, "buy now", growth predictions, etc.) before launch.
      The admin editor shows a non-blocking keyword-heuristic warning while staff author this
      copy (`src/server/trading/advice-language.ts`) and every schema field carries the "never
      investment advice" reminder as help text, but neither is a substitute for a real review -
      the heuristic only catches a fixed phrase list and can't verify tone/intent. Re-run this
      check any time an instrument's about/tip copy changes after launch, not just once.
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
- [ ] **BLOCKING: choose and pay for a market-data provider; verify NSE real-time vs delayed
      coverage.** Trade currently runs on `MockMarketDataProvider` deterministic fixture prices
      (`docs/ARCHITECTURE.md` D39) - real learners must never see fixture prices presented as
      live NSE data. Twelve Data's NSE access is confirmed to need their Grow plan ($29/mo) or
      higher (D39); confirm whether Grow's data is genuinely real-time or itself delayed before
      relying on it for the LIVE feed mode (vs. `DELAYED_15M`, which could tolerate more lag).
      If cost or coverage doesn't work out, D39 names Indian broker APIs (Kite/Upstox/Angel One/
      Dhan) as the fallback, and confirms the relay can poll REST instead of holding a WebSocket
      with zero backend changes either way. Set `TWELVEDATA_API_KEY` (or build a new provider
      under `src/server/market/providers/` and set `MARKET_DATA_PROVIDER` if switching vendors)
      once decided - `GET /api/v1/health`'s `market` field confirms which is actually in effect.
- [ ] **BLOCKING: legal review of the mutual fund simulation** - naming (every fund is a fictional
      Finlamma-branded wrapper, D45), use of real AMFI NAV data for a real scheme tracked
      internally but never disclosed to the learner, SEBI advertising/distribution rules as they
      apply to a kid-facing educational simulation, and whether tracking a real scheme's NAV at
      all is permissible in this form - not yet reviewed by counsel. Same category of review as
      the existing instrument about/tip item above, but a separate item since the underlying
      question (can this exist in this shape at all) is more fundamental than a copy-tone check.
- [ ] Wire real alerting (Sentry or similar) for failed scheduled jobs - today a failed Inngest
      run (the AMFI NAV ingestion job, the SIP execution job, the LIMIT-matching/EOD-cancel jobs,
      the weekly report card) only shows up as a scrubbed log line (`logInternalError`) and in the
      Inngest dashboard's own run history - nobody gets proactively paged. Acceptable for now
      (founder decision, Phase 4 Checkpoint 8) but a real gap once real learners depend on these
      jobs running - deferred from Phase 0's Sentry item above, called out again here since it's
      specifically the AMFI ingestion job's own failure mode that motivated re-flagging it.

## Later (non-blocking — no phase assigned)
- [ ] Visual lesson/quiz content builder for the admin editor, replacing Phase 2b's
      schema-validated JSON editor for `lessons.content`/`questions.payload` (video scene/cue
      timeline, drag-to-order question builder, etc.). Not launch-blocking — the JSON editor with
      human-readable validation, starter templates and a publish preview covers v1's authoring
      needs; revisit once content-team throughput becomes a bottleneck.
