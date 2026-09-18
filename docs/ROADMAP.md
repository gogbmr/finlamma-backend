# finlamma-backend — Roadmap

Work top to bottom. Tick items as they are finished. Publish the API contract
(`pnpm contract`) at the end of each phase.

## Phase 0 — Project setup
- [x] Next.js (App Router, TS strict, Tailwind, ESLint) with pnpm; Prettier; Vitest
- [x] `src/lib/env.ts` with Zod-validated env; `.env.example`
- [x] Drizzle + Supabase Postgres connection; first empty migration
- [ ] Sentry, PostHog server client (deferred - see Pre-launch checklist; env vars are
      already optional in `src/lib/env.ts` so the app runs without them)
- [ ] Error model, `ok()/fail()` helpers, OpenAPI registry, Scalar docs at `/api/docs`
- [ ] `scripts/generate-openapi.ts`, `pnpm contract` script, `GET /api/openapi.json` route,
      first `docs/API_ENDPOINTS.md` generated (health endpoint only)
- [ ] Health endpoint `GET /api/v1/health`
- [ ] Deploy preview on Vercel

## Phase 1 — Identity, roles, activity log
- [ ] Clerk middleware; `requireUser()` for app tokens (Bearer), session auth for admin
- [ ] Clerk webhook → `users` table (created/updated/deleted)
- [ ] `roles`, `permissions`, `role_permissions`, `staff_members`; seed roles
      (super_admin, user_manager, content_uploader, content_publisher, quiz_maker)
- [ ] `requireStaff(permission)` helper
- [ ] `activity_logs` (append-only) + `logActivity()` used everywhere
- [ ] Admin shell: layout, sign-in, staff management page, activity log viewer
- [ ] `GET/PATCH /me`, account deletion (DB + Clerk)

## Phase 2 — Learning content
- [ ] Worlds, lessons (6 node kinds), quizzes, questions (all formats), boss quizzes
- [ ] Content CRUD in admin with draft → published flow and uploads to storage
- [ ] Translations for `en`, `hi`, `hx` on every content field
- [ ] App endpoints: world map, lesson detail, submit quiz answers (server-side scoring)

## Phase 3 — Progress economy
- [ ] XP events, levels, world unlocks
- [ ] V Money ledger, XP → V Money conversion (admin-set rate)
- [ ] Streaks (IST days) + 2 freezes/month; daily goal
- [ ] Badges and rewards (coupons)
- [ ] Certificates on world completion (PDF, stored in storage)

## Phase 4 — Trading engine (needs the market relay for live prices)
- [ ] Instruments table (12 NSE stocks, admin-editable), market holidays, market status
- [ ] Twelve Data REST: quotes and candle history with Redis caching
- [ ] Orders (market/limit), holdings, P&L; idempotency; halts; margin checks
- [ ] `GET /api/v1/relay/config` for the market relay (X-Relay-Secret): instruments, feed mode, halts, holidays
- [ ] Limit-order matching job (Inngest)
- [ ] Mutual funds: AMFI NAV import job, SIP + lump sum
- [ ] Ops console: feed mode, halts, conversion rate, user ledger with risk flags

## Phase 5 — News & Pulse Check
- [ ] Ingestion jobs: Finnhub + India source → `news_raw`
- [ ] AI simplification (3 languages) + jargon term + quiz drafts
- [ ] News Desk console: review, publish toggle, quiz generator settings, engagement
- [ ] App endpoints: feed, story, bookmarks, Pulse Check (server-scored)

## Phase 6 — Arena & social
- [ ] Weekly leaderboards (Redis sorted sets), scopes, leagues with promote/demote job
- [ ] Worlds table; cheers (+5 XP, notification)

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
