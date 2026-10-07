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
- [x] Checkpoint 9 (D47/D48): Ops console - feed mode + per-symbol/global halt controls, all
      `trading.ops`-gated (a new permission, super_admin only), mandatory free-text reason on
      halt/unhalt, every confirm dialog names the exact effect in plain language, every change
      logged. Persistent red banner on every admin page (not just the console) whenever a global
      halt is active, plus `GET /api/v1/health`'s new `tradingHalt` field - a halt can't be left
      on silently. User Trading Ledger (deliberately narrower fields than the prototype's own
      column list - no email/DOB/parent contact/class-world context, see D48) with the exact risk
      rule (NEW = joined <7 days; WATCH = >50% concentration in one position OR >10 orders/day;
      thresholds admin-editable, `trading.ops`-gated) - every load logged like a consent PII
      reveal. KPI tiles and the ledger are both scoped to the trading-active population and/or
      today (IST), batched into a handful of grouped queries per page, and cached, so nothing here
      gets more expensive as total signups/order history grow (D48). Trade-unlock-world setting
      was already admin-editable ahead of this phase (Checkpoint 3/D25's
      `tradingUnlockAfterWorldPosition`) - nothing new needed there. **Not built, deliberately
      flagged rather than silently skipped**: rolling Redis tick history backing an actual
      15-minute-delayed quote feed - `feedMode` still only changes the *stored*/*displayed* value
      today (`GET /trade/market-status`), not what price data is actually served, because there is
      no live tick stream to build rolling history FROM yet (the market relay itself is a separate,
      not-yet-built repo - D38/D39). Tracked below as a follow-up once the relay exists. **No
      volatility control** — closed market always shows the last real close, never a synthetic
      price near a real trade.
- [ ] Rolling Redis tick history + an actual 15-minute-delayed quote-serving path for
      `market_controls.feed_mode = "delayed_15m"` - depends on the market relay (a separate repo,
      out of scope this phase per the Phase 4 kickoff) actually existing and writing a live tick
      stream this backend can build a rolling buffer from. Today, `delayed_15m` only changes the
      stored/displayed feed-mode value (Checkpoint 9), not what price data `GET /trade/quotes`
      actually serves.
- [ ] `instrument_daily_bars` (candle history), indices (NIFTY 50/BANK NIFTY/SENSEX) via the same
      Twelve Data source (folds into Checkpoint 2/7, not a separate checkpoint)

## Phase 5 — News & Pulse Check
- [ ] Ingestion jobs: Finnhub + India source → `news_raw` (2 sources at launch, not the
      prototype's placeholder "7 partner feeds" figure) — **blocked by D50**: no vendor is
      licensed for ingest+LLM-rewrite+commercial-display yet. The ingestion mechanism itself is
      built and tested against `MockNewsProvider`; swapping in a real vendor is a one-file change
      once a vendor confirms in writing (two outreach emails sent by the founder, awaiting reply)
- [x] AI simplification (3 languages) + jargon term + quiz drafts; auto quality grade (A/B/C,
      staff-overridable) + topic tagging (a real `topics` table, shared with lesson questions -
      not free text, see DATA_MODEL.md)
- [x] `news_reads` (backs the read badge). `news_desk_picks` table + app-facing `GET
      /v1/news/desk-picks` exist, but **staff authoring (admin CRUD) for desk picks was never
      built** - the table has no repo insert/update helper or admin UI yet, a real gap for
      `/phase-audit 5` to catch, not a silent one
- [x] Pulse Check ships every format the prototype's 9 UI variants map onto: `single_select`
      covers 3 (MCQ, Sach-ya-Afwah/binary, Odd-One-Out/grid - by original Phase 2b design, see
      `src/server/questions/schemas.ts`), the 5 pre-existing formats cover 5 more directly
      (ordering, sort_buckets, fill_blank, match_pairs, spot_mistake), and the new `number_guess`
      format covers the slider - 7 backend formats, 0 dropped in capability, per the founder-
      approved scope trim (docs/ARCHITECTURE.md, Phase 5 kickoff). The unused "PREDICT" toggle is
      dropped for v1. **AI only ever drafts `single_select`** - the other 6 formats are staff-
      authorable via the existing Question editor and fully playable once tagged, just never
      AI-generated
- [x] News Desk console: review, publish toggle, quiz generator settings, Pulse Check scoring
      incl. D51's daily VM cap, live 7-day engagement chart (not hardcoded), live KPI tiles
- [x] App endpoints: feed, story, Pulse Check (start/serve/answer/finish/result, server-scored).
      **Bookmarks were never built** - `PRODUCT_SPEC.md` §5 lists them, but no `bookmarks` table,
      endpoint or UI exists; another real gap for `/phase-audit 5`, not silently dropped

## Phase 6 — Arena & social
- [x] Weekly leaderboards, scopes (World/State/India/Global — state scope uses `users.state`,
      optional, collected via `PATCH /me`, never shown publicly), leagues with a weekly
      promote/safe/demote settlement job (Checkpoint 3). Leagues are a flat pool per scope with
      computed top/bottom `max(1, round(n/4))` (the prototype's own formula) — no named tiers
      (Bronze/Silver/Gold). Promote/safe reward amounts (default 500/0 VM — safe departs from the
      prototype's 150 by deliberate design, `docs/ARCHITECTURE.md` D55) are admin-editable in
      `/admin/settings`, not `reward_rules` (a dedicated Arena-league settings group instead —
      `reward_rules` is keyed by lesson `activity_kind`, which doesn't fit a zone-based reward).
      **Built as direct Postgres aggregate queries + a weekly Inngest settlement job, not Redis
      sorted sets** as this line originally planned — simpler and safer for a once-a-week payout
      with no live-update requirement; nothing here needed sub-second freshness. A learner is paid
      once for their single best-qualifying zone across scopes, never summed, capped by
      `arena_league_weekly_vm_cap` (D55) — closes a passive-farming hole the multi-scope design
      would otherwise open. A state/world scope below the privacy floor (`docs/ARCHITECTURE.md`
      D52, default 20 active learners) doesn't settle at all that week, not just hide from display.
      Demotion is visible only to the affected learner (`docs/ARCHITECTURE.md` D54 — a deliberate
      departure from the prototype, which broadcasts it); promotion and the crest badge (via a new
      "external" badge criteria type) stay public. Each row also reports `rankDelta` (AR-09's
      weekly move indicator ▲▼—): positive/negative/null against last week's settled rank for
      that same scope, from `leaderboard_snapshots` — null cleanly covers a new entrant or a
      scope that didn't settle last week (below the D52 privacy floor), never a fabricated 0.
      **AR-02 (season countdown): resolved, not a gap.** Confirmed at kickoff — "season" IS this
      weekly reset cycle, not a separate longer-running concept; AR-02 is a client-side countdown
      to next Monday 00:30 IST, computable from `weekStartDate` already on the response with no
      new endpoint needed.
- [x] Worlds table; daily `world_xp_snapshots` rollup job for the 7-day sparkline (AR-04/05). No
      real-time "LIVE" presence tracking for v1 (cut, low value for the infra cost).
      **Not built**: cached per-user aggregate stats (lessons/quiz accuracy/sim P&L) for the
      player-ladder row expansion (AR-10) — the base ladder ships without the expand-a-row detail
      view; a fast-follow, not blocking.
- [x] Cheers (+5 XP) — one cheer per recipient per sender per day, a daily per-receiver XP cap, and
      (`docs/ARCHITECTURE.md` D56) a weekly per-sender-receiver XP cap closing a same-pair
      day-after-day collusion gap the daily cap alone didn't cover. Receiver sees only an
      aggregate weekly count (`docs/ARCHITECTURE.md` D53) — sender identity is never shown, and a
      `cheersEnabled` opt-out exists on `users.preferences`. Push notification not built (no
      notifications infra exists yet — Phase 7); un-cheer/re-cheer never re-awards XP by
      construction (no separate un-cheer action exists to re-trigger a credit).
- [x] Public player profile (FEATURE_MAP AR-20): display name, level, rank title, unlocked badges,
      week XP, streak, quiz accuracy, current world + completion - and a set of **preset "about me"
      chips** picked from an admin-managed catalog, never free-text `bio` (`docs/ARCHITECTURE.md`
      D36 - `users.bio` stays private to the owner forever). Chip catalog admin page
      (`/admin/settings`) and per-user chip-selection table (capped at 3) built.
- [x] Monthly single-stock Competition (Checkpoint 7): isolated virtual capital
      (`competitions.virtual_capital_paise`, `docs/ARCHITECTURE.md` D57) that never touches
      `vmoney_ledger` — a non-convertible sandbox balance, structurally separate tables, no FK or
      code path into the real ledger at all; only the prize at settlement ever creates VM
      (regression-tested directly against the database). Ranked live by ROI% against the FULL
      starting capital (closes tiny-position distortion by construction, not detection). Reduced
      prize bands — 5,000 / 2,000 / 500 VM, D58 — after comparing the naive proposal against the
      whole one-time lesson tree's total payout. Entry-window cutoff + a minimum-qualifying-trade
      count (D59) close a late-lucky-trade gap without touching AR-18's already-decided rules
      copy. Daily Inngest settlement sweep, same two-layer idempotent claim (outer: `settledAt`;
      inner: `competition_prizes`' own unique index) as every other settlement job in this phase.
      **Not built**: the ranked board's row-expansion (AR-16 — best trade, win rate, avg hold
      time per entrant) — same documented fast-follow precedent as AR-10 above, not blocking.

## Phase 7 — Notifications & Doubt Zone
- [x] Expo push tokens, notification preferences, streak/boss/news jobs - push provider behind
      an adapter (mock/Expo, mirroring src/server/market/provider.ts's Twelve Data pattern, no
      Expo account needed to build/test - see `GET /api/v1/health`'s `push` field), all 6
      notification kinds wired (streak_risk/boss_battle/market_news/session_goal/cheer_received/
      league_rank_change), quiet hours + per-category opt-out, 30-day retention job. See
      FEATURE_MAP WH-18 through WH-24, PR-29, SET-07.
- [x] Doubt Zone: streaming AI mentor endpoint with rate limits and minors-appropriate safety
      rules — this is the live upgrade of Phase 2b's scripted in-lesson "Doubt Zone"/"Lamma AI"
      node, and also the standalone Doubt Zone entry point (Checkpoints 1-4: schema, safety
      classifier core, endpoints, in-lesson wiring confirmed/documented - FEATURE_MAP LF-15/SET-14;
      Checkpoint 5: `POST .../messages/{messageId}/report` + `/admin/doubt-zone` moderation queue,
      `doubt_zone.moderate`-gated, metadata-only list with an always-logged content reveal action).
      **AI behavior verified only against mocks so far, not a real model - see the BLOCKING
      pre-launch item and `docs/STATUS.md`'s 2026-09-30 entry.**
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
- [x] RevenueCat webhook → `entitlements`; `GET /me/entitlements`
- [x] Ad eligibility flag (World 3 completed and not ad-free)

## Phase 9 — Analytics & homepage
- [x] Admin analytics dashboards (users, retention, lessons, trading, news, revenue) -
      `/admin/analytics` (`analytics.view`, super_admin only), direct bounded Postgres
      aggregates (`src/server/analytics`), cached 5 min. Trading/news tiles reuse the
      Ops console's and Pulse Check's own already-bounded aggregates rather than
      duplicating them. No query returns or is computed from a single learner's
      identity - aggregate counts only.
- [x] Public homepage, privacy policy, terms, risk disclosure pages - homepage (hero, world
      journey, safety/parents, FAQ) and the three legal pages already existed from Phase 2b
      Checkpoint 7/Phase 2a; this phase added `robots.txt`, `sitemap.ts`, `/contact`, and an
      app-store-badges component ready for real store links once the app ships.
- [x] Server-side PostHog analytics (`posthog-node`, EU-hosted, `POSTHOG_API_KEY`/
      `POSTHOG_HOST` - no PostHog key or SDK ever reaches a browser) - 10 in-app events +
      3 pre-consent onboarding-funnel events, all fire-and-forget, anonymized distinct_id,
      no PII/session-recording/Doubt-Zone capture (docs/ARCHITECTURE.md D69/D70). The
      homepage's own `POST /api/track` beacon is rate-limited per IP, strict-schema
      (`.strict()`, closed enums only), and has no field that could carry PII.

## Pre-launch checklist
- [ ] **Legal review of subscriptions and ads in a minor-directed app** (Apple/Google policy,
      India's DPDP, Google Play Families Policy) - see `docs/ARCHITECTURE.md` D66/D67 (Phase 8
      kickoff): the under-18 non-personalized-ads line and the server-side block on minors
      purchasing subscriptions are this codebase's own calls, not something that can be
      self-certified against store policy or law without outside review. **Treat this as a
      product-risk item, not just a compliance task**: counsel could come back requiring a
      different monetisation design for minors (e.g. narrower ad formats, a different
      subscription-gating rule than D67's current one), not simply a copy/disclosure fix -
      budget for a possible rework pass after the review, not just a sign-off.
- [ ] **Define the refund and parent-contact process for a purchase made on a minor's account**
      (`docs/ARCHITECTURE.md` D68, `/phase-audit 8`): the backend refuses to grant an entitlement
      to a known-or-unknown-age minor and records the attempt (`monetisation.minor_purchase_blocked`
      in the activity log) for staff to find, but it cannot itself undo a store-level charge that
      already happened - someone has to actually contact the parent and issue the refund (via
      RevenueCat's dashboard/API or the store directly). Not automated by design; needs a written
      process before this is discovered live for the first time.
- [ ] **Seed `ads_config` in production `settings_kv`** (Phase 8) - deliberately not done at
      merge time since `getAdsSettings()`'s code fallback (`DEFAULT_ADS_SETTINGS`, position 3) is
      identical to what seeding would insert, so there's no functional gap today; seeding only
      matters once staff actually want to tune the ad-start world position from `/admin/settings`
      instead of a code change. See `docs/STATUS.md`'s 2026-10-04 merge entry.
- [ ] **Confirm no learner-authored free text is ever rendered to another learner** (D36,
      `docs/ARCHITECTURE.md`) - `users.bio` must stay `GET`/`PATCH /me`-only forever; re-check this
      specifically when Phase 6's public player profile (AR-20) ships, and again for any future
      feature that surfaces one learner's content to another.
- [ ] **Review the 40 unindexed-foreign-key and 49 unused-index Supabase advisor findings**
      (`INFO` level, first flagged by the Phase 2b audit at 8/15, `docs/STATUS.md`; recount as of
      the `/phase-audit 7` run, 2026-09-30, now at 40/49 as later phases - most recently Phase 7's
      `doubt_threads`/`doubt_messages`/`notifications`/`push_tokens` - added more tables/FKs) - low-
      traffic pre-launch noise today (e.g. `legal_documents.published_by`, `quiz_attempts.lesson_id`,
      `question_answers.question_id`, `doubt_messages.reviewed_by`, `doubt_threads.lesson_id` have no
      covering index), but worth a real pass once query patterns and data volume are closer to
      production before launch.
- [ ] **Native-speaker review of all Hindi and Hinglish content** (mentors, worlds, lessons,
      questions, emails, consent pages, **instrument about/tip copy** — `scripts/seed-instruments.ts`,
      **and the Terms/Privacy/Risk-disclosure `hi`/`hx` drafts in `scripts/seed-legal-documents.ts`**)
      — the seed/draft copy written during development (e.g. `scripts/seed-mentors.ts`'s
      Hindi/Hinglish bios, and the legal-document translations) is a best-effort approximation, not
      reviewed by a native speaker. The legal-document translations specifically need a reviewer who
      can confirm the *legal meaning* survived translation, not just that the words are readable —
      a mistranslation in a risk disclosure or consent-adjacent clause is a materially different risk
      than one in a mentor bio.
- [ ] **Legal/compliance review of every `instruments.about`/`instruments.tip` field for
      advice-like language** (target prices, "buy now", growth predictions, etc.) before launch.
      The admin editor shows a non-blocking keyword-heuristic warning while staff author this
      copy (`src/server/trading/advice-language.ts`) and every schema field carries the "never
      investment advice" reminder as help text, but neither is a substitute for a real review -
      the heuristic only catches a fixed phrase list and can't verify tone/intent. Re-run this
      check any time an instrument's about/tip copy changes after launch, not just once.
- [ ] **BLOCKING: verify Doubt Zone crisis helpline numbers with a current official source, and
      confirm the wording with someone qualified** (Phase 7 kickoff decision, `docs/ARCHITECTURE.md`).
      `settings_kv` key `doubt_zone_safety` seeds Childline India (1098), KIRAN mental health
      (1800-599-0019 / 14416) and NCPCR SAMVEDNA (1800-121-2830), checked against wcd.gov.in and PIB
      press releases on 2026-09-30 - but Childline 1098 is actively being merged into the police
      emergency line 112 state-by-state, so this is a live-moving target, not a one-time check. The
      seeded redirect/disclosure copy is marked DRAFT and must not go live as-is: get it read by
      someone qualified (a counsellor, child-safety professional, or similar) before launch, and
      re-verify the numbers themselves close to the actual launch date, not just once during
      development.
- [ ] **BLOCKING: run live Doubt Zone probes with a real `ANTHROPIC_API_KEY` and review the actual
      responses in all three languages before launch** - a normal finance question, a direct advice
      request ("should I buy X"), an off-topic question, a safety probe worded the way a teenager
      plausibly would, a prompt-extraction/jailbreak attempt, and a message containing personal
      details (name/school). As of 2026-09-30, Phase 7's AI behavior (system prompt, safety
      classifier, advice-language circuit breaker) is verified only against mocked model responses
      in the automated test suite - the real model has never actually been run against these
      prompts. See `docs/STATUS.md`'s Phase 7 entry.
- [ ] **BLOCKING: define who holds `doubt_zone.moderate`, and write a policy for handling flagged
      safety content involving minors** (`/phase-audit 7`, 2026-09-30). The flagged-only design
      (`docs/ARCHITECTURE.md`) means a small number of trusted staff can see a flagged message's
      actual content and the classifier's reasoning - right now that's whoever holds `super_admin`
      or `user_manager`, seeded by default, with no written guidance for what a staff member is
      actually supposed to DO on finding a genuine self-harm/abuse signal (escalate to whom, how
      fast, is a parent ever contacted, is this logged/reported anywhere outside the app). The
      technical side (fail-closed classification, always-logged reveal, deterministic redirect
      copy) is built; the human process behind it is not, and that gap matters as much as the code
      for a feature that talks to minors about their wellbeing.
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
- [ ] **Real-Postgres concurrency test for limit-order matching**, once a separate dev database
      exists (same gap and same fix as the world-reorder item directly above). `docs/ARCHITECTURE.md`
      D49's fix to `matchOpenLimitOrderTx` (`src/server/orders/repo.ts`) is covered today by a test
      that fires two overlapping calls via `Promise.all` against PGlite, but PGlite's single
      connection fully serializes `db.transaction()` calls, so that test can only prove "safe under
      repeated/overlapping invocation," not "a real race loses cleanly." Once a real multi-connection
      Postgres is available, add a test that fires two genuinely concurrent `matchOpenLimitOrderTx`
      calls for the same order from two separate connections and confirms exactly one fills.
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
- [ ] Create PostHog project (EU region), add `POSTHOG_API_KEY`/`POSTHOG_HOST` - the
      `posthog-node` server client (`src/lib/analytics.ts`) and every capture-site are already
      built (Phase 9, docs/ARCHITECTURE.md D69) and no-op without these, so this is purely an
      account-creation + env-var step, not a code dependency.
- [ ] **Legal review: pre-consent onboarding-funnel analytics (docs/ARCHITECTURE.md D70).**
      Finlamma sends anonymous (internal-UUID, no-PII) funnel events to PostHog for the
      onboarding steps that happen BEFORE a minor's parental consent is recorded (date-of-birth
      entered, consent requested, consent completed) - a deliberate founder decision to measure
      signup drop-off, never used for targeting, but genuinely behavioural data about a minor
      collected ahead of consent. Needs a written answer ready for a regulator or parent asking
      about it, not a quiet default - see D70 for the full reasoning to review against.
- [x] **Close the English-only legal-pages vs. Hindi/Hinglish consent-pages inconsistency.**
      Fixed on `legal-and-contact-drafts`: `/legal/[type]` now has the same language switcher
      (en/hi/hx) as `/consent/confirm`/`/consent/reapprove`, reusing the same `src/app/consent/copy.ts`
      (`LANGUAGE_LABELS`, `ConsentLang`, `reapproveDocumentLabel`, plus a new `LEGAL_PAGE_COPY`
      entry for the page's own chrome) rather than inventing a second switcher. Defaults to English;
      the choice is remembered via `localStorage` (`finlamma_legal_lang`, read/write wrapped in
      try/catch) - note this is new, since the consent pages themselves don't actually persist a
      choice (plain `useState`, resets to English every visit) despite initially being described
      that way when this fix was requested. The DRAFT placeholder banner renders unconditionally
      regardless of which language is selected.
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
      **Treat this as a product-risk item, not just a compliance task**: the review could
      conclude the current design (fictional wrapper tracking a real scheme's NAV, D45) can't
      ship as-is, which would mean redesigning the Funds feature itself (e.g. dropping the
      real-NAV tracking, or the fictional-wrapper framing entirely), not a naming/disclosure
      tweak - budget for that possibility, not just a sign-off.
- [ ] Wire real alerting (Sentry or similar) for failed scheduled jobs - today a failed Inngest
      run (the AMFI NAV ingestion job, the SIP execution job, the LIMIT-matching/EOD-cancel jobs,
      the weekly report card) only shows up as a scrubbed log line (`logInternalError`) and in the
      Inngest dashboard's own run history - nobody gets proactively paged. Acceptable for now
      (founder decision, Phase 4 Checkpoint 8) but a real gap once real learners depend on these
      jobs running - deferred from Phase 0's Sentry item above, called out again here since it's
      specifically the AMFI ingestion job's own failure mode that motivated re-flagging it.
- [ ] **BLOCKING: fix the authenticated admin-path hang in production (Next 16.3.5 / `@clerk/nextjs`
      7.9.4).** Not just a local dev-mode cosmetic issue as first believed (2026-10-05) - a real,
      fresh-incognito-confirmed staff session hangs ~300s on every `/admin/(dashboard)/*` route in
      production too (2026-10-06), since the earlier "build mode and the Vercel preview work
      correctly" conclusion only ever tested a signed-out redirect, which can't prove
      `clerkMiddleware()` actually ran. See `docs/STATUS.md`'s 2026-10-06 entry for the full
      diagnosis, external research (likely tied to Next 16's `middleware.ts`→`proxy.ts` migration
      being actively unstable upstream right now) and the recommended patch-version upgrade path.
      **Whatever fix is attempted, re-verification must hit every `/admin/(dashboard)/*` route with
      a real signed-in staff session, not just a signed-out redirect** - that blind spot is what let
      this ship unnoticed in the first place. Delete the workaround notes in `CLAUDE.md`/
      `docs/STATUS.md` once a real fix lands and is verified that way.

## Later (non-blocking — no phase assigned)
- [ ] Visual lesson/quiz content builder for the admin editor, replacing Phase 2b's
      schema-validated JSON editor for `lessons.content`/`questions.payload` (video scene/cue
      timeline, drag-to-order question builder, etc.). Not launch-blocking — the JSON editor with
      human-readable validation, starter templates and a publish preview covers v1's authoring
      needs; revisit once content-team throughput becomes a bottleneck.
- [ ] Consider matching the consent pages' language selection to the legal pages' persistence
      (`/legal/[type]` remembers the chosen language via `localStorage`; `/consent/confirm`,
      `/consent/reapprove`, `/consent/withdraw`, and `/consent/weekly-report/unsubscribe` are
      plain `useState`, so they reset to English every visit). Low priority, and not worth
      touching consent-flow code before the pre-launch legal review of that flow.
- [ ] **Batch N+1 queries in background jobs before real user volume.** Found during the D72
      investigation's follow-up audit (2026-10-07) - all four are in Inngest background jobs, not
      request paths, so none is urgent today with zero real users, but each does one DB round
      trip per item in a loop where a single batched query (`inArray()` + a join/`groupBy`, the
      same shape `countInProgressLearnersByLessonIds` already uses) would do:
      - `src/server/onboarding/service.ts` (~line 1100) - one `getLegalDocumentById()` call per
        pending legal-reapproval request. Grows with consented-minor count x legal-doc changes.
      - `src/server/onboarding/service.ts` (~line 842) - one `claimReapprovalRequestSlot()` call
        (which opens its own transaction) per already-consented minor on a new legal-doc version -
        N separate transactions, not just N queries. Grows with the real user base.
      - `src/server/news/service.ts` (~lines 141-145) - **the worst of the four**: nested loop
        (pending stories x engaged readers), and `notifyUser()` itself does 3 round trips per
        call - `pending x readers x 3+` total. Would be genuinely bad at any real scale, not just
        a large one.
      - `src/server/daily-goals/service.ts` (~line 87) - one `hasBeenNotifiedSince()` call per
        active user, every day. Grows directly with DAU.
      Safe to leave alone at zero users; fix before any of these jobs runs against a real,
      growing user base - the news-notification one especially shouldn't wait for a crisis the
      way the admin shell's 22-query check did (docs/ARCHITECTURE.md D72).
