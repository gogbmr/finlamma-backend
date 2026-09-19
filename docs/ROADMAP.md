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

## Phase 2 — Learning content
- [ ] Worlds, lessons (6 node kinds), quizzes, questions (all formats), boss quizzes
- [ ] Content CRUD in admin with draft → published flow and uploads to storage
- [ ] Translations for `en`, `hi`, `hx` on every content field
- [ ] App endpoints: world map, lesson detail, submit quiz answers (server-side scoring)

## Phase 3 — Progress economy
- [ ] XP events, levels, world unlocks
- [ ] `reward_rules` (admin-editable default XP + VM per activity kind, seeded per
      `docs/ECONOMY.md`), V Money ledger; XP and VM earned independently (no conversion rate)
- [ ] Global VM issuance multiplier (`settings_kv.vm_issuance_multiplier`, default 1.0), recorded
      on every ledger entry
- [ ] Streaks (IST days) + 2 freezes/month; daily goal
- [ ] Badges and rewards (coupons)
- [ ] Mentors content type (admin CRUD: name, bio, world range, art, per language)
- [ ] Certificates on world completion (PDF, stored in storage)
- [ ] Weekly report card: `report_snapshots` Inngest job (Monday IST), efficiency score,
      module breakdown, 8-week trend; `coach_note_templates` (admin-editable, draft → publish,
      no AI) — see `docs/PRODUCT_SPEC.md` §6 for the exact formula and template rules
- [ ] `users.bio`, `users.preferences` (sound/haptics/data-saver); Settings screens that don't
      need their own backend (legal pages, contact, rate-app) ship as static/deep-link content

## Phase 4 — Trading engine (needs the market relay for live prices)
- [ ] Instruments table (12 NSE stocks, admin-editable), market holidays, market status
- [ ] Twelve Data REST: quotes and candle history with Redis caching
- [ ] "Explore mode": quotes/charts/watchlist visible to everyone; order pad locked until
      `settings_kv.trade_unlock_world_order` (default: Market Maidan/World 4) is reached — no
      starting balance or unlock grant, ever (see `docs/ECONOMY.md`)
- [ ] Orders (market/limit, whole shares only), holdings, P&L; idempotency; halts; margin checks
- [ ] `GET /api/v1/relay/config` for the market relay (X-Relay-Secret): instruments, feed mode, halts, holidays
- [ ] Limit-order matching job (Inngest)
- [ ] Mutual funds: AMFI NAV import job, SIP (tiered minimums: ₹100 index / ₹500 other) + lump sum
- [ ] `instrument_daily_bars` (candle history), indices (NIFTY 50/BANK NIFTY/SENSEX) via the same
      Twelve Data source
- [ ] Ops console: feed mode, halts, trade-unlock-world setting, user ledger with risk flags
      (default rule: NEW = joined <7 days ago; WATCH = >50% of portfolio in one position or >10
      orders in a day; admin-tunable thresholds), live KPI queries (not hardcoded)

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
- [ ] Weekly leaderboards (Redis sorted sets), scopes, leagues with promote/demote job. Leagues
      are a flat pool per scope with computed top/bottom ~25% (matches the prototype) — no named
      tiers (Bronze/Silver/Gold) for v1
- [ ] Worlds table; daily `world_xp_snapshots`/rollup job for the 7-day sparkline; cached
      per-user aggregate stats (lessons/quiz accuracy/sim P&L) for leaderboard row expansion. No
      real-time "LIVE" presence tracking for v1 (cut, low value for the infra cost)
- [ ] Cheers (+5 XP, notification)
- [ ] Monthly single-stock Competition: isolated virtual capital, ROI%-ranked leaderboard,
      admin-configurable **virtual-only** prizes (V Money / badges / coupons, never real
      currency) — depends on Phase 4's order execution primitives

## Phase 7 — Notifications & Doubt Zone
- [ ] Expo push tokens, notification preferences, streak/boss/news jobs
- [ ] Doubt Zone: streaming AI mentor endpoint with rate limits and safety rules

## Phase 8 — Monetisation
- [ ] RevenueCat webhook → `entitlements`; `GET /me/entitlements`
- [ ] Ad eligibility flag (World 3 completed and not ad-free)

## Phase 9 — Analytics & homepage
- [ ] Admin analytics dashboards (users, retention, lessons, trading, news, revenue)
- [ ] Public homepage, privacy policy, terms, risk disclosure pages

## Pre-launch checklist
- [ ] Create Sentry project, add `SENTRY_DSN` (+ auth token for source maps), wire up
      `@sentry/nextjs` (client, server, edge configs) - deferred from Phase 0
- [ ] Create PostHog project, add `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST`, wire up
      the `posthog-node` server client - deferred from Phase 0
- [ ] Set up Playwright and e2e tests for admin pages (`pnpm test:e2e`) - deferred from Phase 1's
      admin shell; needs browsers installed locally (`pnpm exec playwright install`), which
      wasn't attempted in the sandbox this was built in over a slow connection
