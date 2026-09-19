# finlamma-backend

Backend for **Finlamma**, a gamified financial-literacy app with virtual-money paper trading.
One Next.js project serving: the mobile app's REST API (`/api/v1`), the staff admin
dashboard (`/admin`), and the public homepage (`/`).

Read before starting any feature:
- What we build: `docs/PRODUCT_SPEC.md`
- How the system fits together + key decisions: `docs/ARCHITECTURE.md`
- Build order and current progress: `docs/ROADMAP.md`
- Tables: `docs/DATA_MODEL.md`
- Every endpoint with request/response formats: `docs/API_ENDPOINTS.md` (generated — see below)
- UI designs, including the admin Ops console and News Desk: the prototype at
  `D:\nextjs_projects\finlamma final project\ui_file\Finlamma_UI` (read-only, outside this repo)

**This is one of three separate projects** (server, market relay, app). Never import code or
read files from the other two projects; they communicate only over HTTP, Socket.IO and Redis
as described in `docs/ARCHITECTURE.md`. Never modify the prototype folder.

The user is a startup founder building this by vibe coding. Explain decisions in plain,
simple English. When a request is ambiguous or conflicts with these docs, ask first.

## Stack (do not swap libraries without asking)
Next.js (App Router) + TypeScript strict · pnpm · Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `postgres`)
on Supabase Postgres · Clerk (`@clerk/nextjs`, `@clerk/backend`, `svix` for webhooks) · Zod +
`@asteasolutions/zod-to-openapi` · Scalar API reference · `@aws-sdk/client-s3` (Supabase Storage)
· Inngest · Upstash Redis + ratelimit · `decimal.js` · `expo-server-sdk` · `@anthropic-ai/sdk`
· Resend + react-email · Tailwind + shadcn/ui + TanStack Table + Recharts + react-hook-form (admin)
· PostHog (`posthog-node`) · Sentry (`@sentry/nextjs`) · Vitest + Playwright.
External data: Twelve Data (market), Finnhub + India news source, AMFI NAVs.

For current library APIs, use the **context7** MCP server; for Clerk code, the **clerk** MCP.
Do not rely on memory for fast-moving APIs (Next.js, Clerk, Drizzle, Inngest).

## Commands
```
pnpm dev            # Next.js dev server
pnpm inngest:dev    # Inngest dev server (npx inngest-cli@latest dev)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest run
pnpm test:e2e       # playwright (admin UI)
pnpm db:generate    # drizzle-kit generate  (creates a new SQL migration from schema)
pnpm db:migrate     # drizzle-kit migrate   (applies migrations — ask the user first)
pnpm db:studio      # drizzle-kit studio
pnpm contract       # regenerate openapi/openapi.json AND docs/API_ENDPOINTS.md
                    #   = tsx scripts/generate-openapi.ts && node scripts/openapi-to-markdown.mjs openapi/openapi.json docs/API_ENDPOINTS.md
```
Create these scripts in package.json during project setup if they don't exist.

## Folder structure
```
src/
  app/
    (public)/            homepage, legal pages
    admin/               staff dashboard (Clerk-protected + permission-gated)
    api/v1/<resource>/   route handlers — thin: parse → authorize → call service → respond
    api/webhooks/        clerk, revenuecat
    api/inngest/         Inngest serve endpoint
    api/docs/            Scalar API reference (interactive)
    api/openapi.json/    serves openapi/openapi.json (the app downloads its contract here)
  server/
    <domain>/            business logic by domain: users, worlds, lessons, quizzes, xp,
                         ledger, trading, market, news, arena, notifications, entitlements,
                         certificates, analytics
      service.ts         domain logic (pure where possible)
      schemas.ts         Zod request/response schemas (registered in OpenAPI)
      repo.ts            Drizzle queries for this domain
      *.test.ts
  db/
    schema/              Drizzle table definitions, one file per domain
    client.ts
  test/
    db.ts                createTestDb() — in-process PGlite db, migrated fresh from drizzle/
    fixtures.ts          uniqueEmail(), uniqueClerkUserId() — generated, collision-proof test values
  lib/
    auth.ts              requireUser(), requireStaff(permission)
    activity-log.ts      logActivity()
    http.ts              ok(), fail(), withErrors(), pagination helpers
    errors.ts            AppError + error codes
    openapi.ts           registry
    redis.ts, s3.ts, inngest.ts, env.ts (Zod-validated env)
  inngest/functions/     background jobs
drizzle/                 generated migrations (never hand-edit existing files)
openapi/openapi.json     generated contract (committed) consumed by finlamma-app over HTTP
openapi/CHANGELOG.md     plain-English contract changes per version
docs/API_ENDPOINTS.md    generated endpoint reference: every route, auth, params, request + response examples
scripts/generate-openapi.ts      builds openapi.json from the registry (create in Phase 0)
scripts/openapi-to-markdown.mjs  renders API_ENDPOINTS.md (provided — don't rewrite)
```

## Non-negotiable rules
1. **Every endpoint**: Zod-validate input, authenticate (`requireUser` / `requireStaff(perm)`),
   register request/response schemas in OpenAPI, and call `logActivity()` for every mutation.
   Use the `new-endpoint` skill.
2. **Money**: V Money and prices are integers (`bigint` columns, `mode: "number"`); prices in paise.
   Never use floats for money. Balances are derived from `vmoney_ledger`, never stored as the
   source of truth. See the `money-ledger` skill.
3. **Trading**: never trust a price, balance or timestamp from the client. The execution price
   comes from Redis (written by the market relay). Honour market hours, holidays and halts.
   Every order endpoint requires an `Idempotency-Key` header. See the `trading-rules` skill.
4. **Auth**: Clerk verifies identity; authorization is ours. Staff permissions come from
   `roles/permissions/role_permissions`. Check permissions on the server, never only in the UI.
5. **Activity logs are append-only.** No update or delete paths, for anyone.
6. **Portability**: no Supabase-only features in core logic (no RLS-as-authorization, no Edge
   Functions, no supabase-js for data). Storage only through `src/lib/s3.ts`. Every table has
   Row Level Security **enabled with no policies** (`.enableRLS()` in the Drizzle schema) as
   defense in depth — our server connects as the table-owning `postgres` role, which bypasses
   RLS, so this has no effect on the app; it only blocks Supabase's Data API/anon key path,
   which is disabled in the dashboard and must never be re-enabled or used from this codebase.
7. **Time**: store UTC `timestamptz`; compute streak days and market hours in `Asia/Kolkata`.
8. **Schema changes**: edit `src/db/schema`, run `pnpm db:generate`, review the SQL, then ask
   the user before `pnpm db:migrate`. Use the `db-migration` skill. **Never push code that
   depends on a migration that hasn't actually been applied to the real database yet** — a
   migration sitting generated-but-unrun in `drizzle/` while dependent code ships is a real
   incident waiting to happen, not a theoretical one. `GET /api/v1/health`'s `migrations` field
   (compares the latest local migration in `drizzle/meta/_journal.json` against
   `drizzle.__drizzle_migrations`) exists to catch this after the fact — treat it as a safety
   net, not a substitute for running `pnpm db:migrate` before pushing.
9. **Secrets**: never read `.env*` files or print secrets. New variables go into `.env.example`
   and `src/lib/env.ts`, and you tell the user what to add.
10. **Privacy (kid-safe)**: public display name = first name + last initial. No photos, no chat
    between users. Support full account deletion (our DB + Clerk).
11. **AI features** (news simplification, quiz drafts, Doubt Zone): use `@anthropic-ai/sdk`
    with model names from env (`ANTHROPIC_MODEL_FAST`, `ANTHROPIC_MODEL_SMART`). AI output
    is a draft until a staff member publishes it (except Doubt Zone chat replies, which are
    streamed but must refuse personal investment advice).
12. **Tests must never touch the real Supabase database.** A test that needs real Postgres
    behavior (constraints, `ON CONFLICT`, RLS, ...) mocks `@/db/client` to return
    `createTestDb()` from `src/test/db.ts` — an in-process PGlite instance migrated fresh from
    `drizzle/` — never the real `DATABASE_URL`. `src/db/client.ts` throws immediately if
    evaluated with `NODE_ENV=test`, so an unmocked import fails loudly instead of silently
    reaching production. Use `uniqueEmail()`/`uniqueClerkUserId()` from `src/test/fixtures.ts`
    (or another generated value) for anything with a unique constraint — never a hardcoded
    email or id, which can collide across parallel test runs.

## API endpoint documentation (required)
`docs/API_ENDPOINTS.md` must always list **every** endpoint with method, path, summary, auth,
parameters, request body (field table + JSON example) and every response (JSON example).
It is generated, so keep it complete by keeping the OpenAPI registration complete:
- Every route is registered with a `summary`, `description`, `tags`, security, all parameters
  (including headers like `Idempotency-Key`), request schema and **all** response codes.
- Every schema field has `.describe()` text and a realistic `.openapi({ example })`.
- Run `pnpm contract` after any API change and commit `openapi/`, `docs/API_ENDPOINTS.md` together.
- Never edit `docs/API_ENDPOINTS.md` by hand (a hook blocks it).
Webhook endpoints (Clerk, RevenueCat) and the relay-only endpoints are registered too, with their
own security schemes, so the document covers the whole backend.

## API conventions (details in the `api-conventions` skill)
- Success: `{ "data": ... }`; list: `{ "data": [...], "nextCursor": "..." | null }`
- Error: `{ "error": { "code": "INSUFFICIENT_MARGIN", "message": "...", "details": {} } }`
  with proper HTTP status. Error codes are UPPER_SNAKE and listed in `src/lib/errors.ts`.
- Cursor pagination, ISO 8601 UTC dates, camelCase JSON, kebab-case URLs.
- Breaking API changes need a new route or version, never a silent change.

## How to work
- Start each roadmap phase with `/phase-kickoff`. Plan before coding on anything non-trivial.
- Small steps: one endpoint or feature at a time, with tests, then commit with a clear message.
- After finishing a feature: run `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm contract`
  if the API changed, and tick the item in `docs/ROADMAP.md`.
- Use the `code-reviewer` subagent before committing larger changes and `security-auditor`
  for anything touching auth, permissions, money or trading.
- If you make an architectural decision, append it to the decisions table in `docs/ARCHITECTURE.md`.
