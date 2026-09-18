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
