---
name: phase-audit
description: Audit that all completed roadmap phases are really done and working in production, with evidence, before starting the next phase.
disable-model-invocation: true
argument-hint: "[phase numbers, e.g. 0-1; default = all ticked phases]"
---

This is a **read-only audit**. Do not fix anything, edit code, run migrations, or write files
other than the final `docs/STATUS.md` update in step 10. If a check requires a write to test it
(e.g. hitting a mutating endpoint), skip the write and note it as NEEDS-USER instead.

## 1. Scope
Read `docs/ROADMAP.md`, `docs/STATUS.md` (if present), `CLAUDE.md`, and `git log --oneline -50`.
Audit the phases given in `$ARGUMENTS`. If none given, audit every phase that has at least one
ticked `[x]` item. List the exact phases and items in scope before doing anything else.

## 2. Roadmap items vs. real code
For every ticked `[x]` item in the scoped phases, find the file(s) that actually implement it
(route handlers, `service.ts`/`repo.ts`/`schemas.ts`, schema tables, admin pages, tests). Record
the file paths as evidence. If an item is ticked but you can't find the code, or the code is a
stub/TODO/partial implementation, mark it incomplete — do not give benefit of the doubt.

## 3. Code health
Run in one pass and capture exact output:
```
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
```
Report exact pass/fail counts (tests passed/failed/skipped, lint errors/warnings, typecheck
errors). Call out any test file that crashed rather than failed normally, and any skipped
(`.skip`/`.todo`) test.

## 4. Database (Supabase MCP — read-only queries only)
- Compare every migration file under `drizzle/meta/_journal.json` against the rows in
  `drizzle.__drizzle_migrations` — every generated migration must actually be applied.
- Compare the real schema (tables, columns, types, constraints, indexes) against
  `src/db/schema/*` — flag any drift in either direction.
- Confirm RLS is enabled on every table in the `public` schema (per rule 6 in CLAUDE.md, this is
  enabled-with-no-policies as defense in depth, not app authorization — so also confirm no
  policies exist that the app might be silently relying on instead of `requireUser`/`requireStaff`).
- Run the Supabase security advisor (`get_advisors`) and report every warning at or above `warn`
  level. `info`-level is fine to note but not a FAIL.

## 5. API surface
- List every route file under `src/app/api/v1` and `src/app/api/webhooks`. Confirm each is
  registered in the OpenAPI registry (`src/lib/openapi.ts` registrations) and has a corresponding
  section in `docs/API_ENDPOINTS.md` with request and response JSON examples.
- Regenerate the contract into a temp location (don't overwrite the committed files) and diff
  against the committed `openapi/openapi.json` and `docs/API_ENDPOINTS.md` to confirm they're
  current. Use the scratchpad directory for the temp output.
- For every mutating route (POST/PATCH/PUT/DELETE), confirm it calls `logActivity()`.
- For every route, confirm it calls `requireUser` or `requireStaff(permission)`, or list it
  explicitly as intentionally public (e.g. health check, webhooks with signature verification).

## 6. Production checks (read-only, against https://finlamma-backend-rho.vercel.app)
- `GET /api/v1/health` returns OK and its `migrations` field shows no drift.
- Every authenticated app endpoint in scope returns 401 without a token — never a 500.
- Webhook endpoints (Clerk, RevenueCat) reject unsigned/unverified requests with 400, not 500
  or 200.
- `/admin` redirects a signed-out visitor to sign-in rather than rendering.
- `git status` is clean and `origin/main` HEAD matches what's actually deployed (compare the
  deployed commit, e.g. via a health/version field or Vercel deployment info, against
  `git rev-parse origin/main`).

## 7. Security
Run the `security-auditor` subagent over the code from the audited phases (auth, permissions,
money/ledger, trading, webhooks — whichever apply to the scoped phases). Include its findings
verbatim in the report.

## 8. Docs vs. reality
Confirm `CLAUDE.md`, the decisions table in `docs/ARCHITECTURE.md`, and `docs/DATA_MODEL.md`
match what the code actually does for the scoped phases. Confirm every env var name in
`.env.example` matches a corresponding entry in `src/lib/env.ts` (and vice versa). Never read
`.env.local` or any real `.env*` file — only `.env.example`.

## 9. Report
Produce a single table, one row per check, columns: **Check | Result (PASS/FAIL/NEEDS-USER) |
Evidence**. Evidence must be concrete: a command's exact output, a file path with line numbers,
or a query result — not "looks fine."

Then two numbered lists:
1. **Fix list** — every FAIL, ordered most severe first (money/security/data-integrity issues
   before cosmetic/doc drift), each with what's wrong and where.
2. **Your actions** — every NEEDS-USER item, i.e. anything that requires the Clerk, Vercel, or
   Supabase dashboard, or another action only the user can take. Give exact steps.

Explain findings in plain English and say why each fix matters, per the user's global
preferences.

## 10. Wait for approval
Stop after the report. Do not fix anything. Once the user approves specific items from the fix
list, apply only those fixes, then re-run only the checks that previously failed and show them
passing now. Finally, update `docs/STATUS.md` (create it if it doesn't exist) with the audit
date, the phases audited, and the result summary.
