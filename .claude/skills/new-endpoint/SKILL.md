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
4. **Service** in `src/server/<domain>/service.ts` holds the logic; DB access in `repo.ts`.
   Wrap multi-table writes in a Drizzle transaction.
5. **Activity log**: every mutation calls `logActivity({ actorType, actorId, action: "<domain>.<verb>", targetType, targetId, metadata })`
   inside the same transaction when possible.
6. **Rate limit** sensitive endpoints (auth-adjacent, orders, AI) with `@upstash/ratelimit`.
7. **Errors**: throw `AppError(code, message, status)` with a code from `src/lib/errors.ts`
   (add new codes there). Never leak stack traces or SQL.
8. **Tests** (`*.test.ts`, Vitest): happy path, validation failure, unauthorized, forbidden
   (for staff routes), and domain edge cases.
9. Run `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm contract`.
10. Open `docs/API_ENDPOINTS.md` and check the new endpoint's section is complete (params,
    request example, all responses). If something is missing, fix the registration, not the doc.
11. Commit code + `openapi/` + `docs/API_ENDPOINTS.md` together.
12. Summarise for the user: method, path, who can call it, request/response example.
