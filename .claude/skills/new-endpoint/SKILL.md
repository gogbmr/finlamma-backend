---
name: new-endpoint
description: Checklist for adding or changing any REST endpoint under /api/v1 — schemas, auth, permissions, activity log, OpenAPI registration and tests. Use whenever creating or modifying a route handler.
paths: "src/app/api/**, src/server/**"
---

Follow every step. Do not skip the activity log or OpenAPI registration.

1. **Schemas** in `src/server/<domain>/schemas.ts`: request body/query/params and the response,
   with Zod. Add `.openapi({ example })` metadata. Reuse shared schemas (pagination, ids).
2. **Register** the route in the OpenAPI registry (`src/lib/openapi.ts`): method, path, tags,
   `summary` + `description`, security (`bearerAuth` for app, `clerkSession` for admin,
   `relaySecret` for relay-only), all parameters and headers, request schema and **every**
   response code with a schema. Every field needs `.describe()` and a realistic example —
   this is what `docs/API_ENDPOINTS.md` is generated from.
3. **Route handler** in `src/app/api/v1/<resource>/route.ts` stays thin:
   `withErrors(async (req) => { const user = await requireUser(req); const input = Schema.parse(...); const result = await service.fn(user, input); return ok(result); })`
   Admin/staff routes use `requireStaff("<permission.key>")`.
4. **Import the new route file in `scripts/generate-openapi.ts`** (the "Import every route file
   that registers a path as a side effect" list near the top). A route file that registers a path
   but is never imported there silently never reaches `openapi.json`/`docs/API_ENDPOINTS.md`, even
   though `pnpm contract` exits 0 - this bit Phase 2b Checkpoint 2. `scripts/generate-openapi.test.ts`
   scans `src/app/api/v1` and fails the run if any `route.ts` is missing from that import list, so
   forgetting this step fails `pnpm test`, not just the honor system - but add the import anyway,
   don't rely on the test to remind you.
5. **Service** in `src/server/<domain>/service.ts` holds the logic; DB access in `repo.ts`.
   Wrap multi-table writes in a Drizzle transaction.
6. **Activity log**: every mutation calls `logActivity({ actorType, actorId, action: "<domain>.<verb>", targetType, targetId, metadata })`
   inside the same transaction when possible.
7. **Rate limit** sensitive endpoints (auth-adjacent, orders, AI) with `@upstash/ratelimit`.
8. **Errors**: throw `AppError(code, message, status)` with a code from `src/lib/errors.ts`
   (add new codes there). Never leak stack traces or SQL.
9. **Tests** (`*.test.ts`, Vitest): happy path, validation failure, unauthorized, forbidden
   (for staff routes), and domain edge cases.
10. Run `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm contract`.
11. Open `docs/API_ENDPOINTS.md` and check the new endpoint's section is complete (params,
    request example, all responses). If something is missing, fix the registration, not the doc.
12. Commit code + `openapi/` + `docs/API_ENDPOINTS.md` together.
13. Summarise for the user: method, path, who can call it, request/response example.
