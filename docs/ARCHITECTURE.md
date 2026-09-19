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
