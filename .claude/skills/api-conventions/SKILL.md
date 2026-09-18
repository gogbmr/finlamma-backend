---
name: api-conventions
description: Response envelope, error codes, pagination, naming and versioning rules for the Finlamma REST API. Background reference for any API work.
user-invocable: false
---

- Base path `/api/v1`. Resources are plural kebab-case nouns: `/api/v1/lessons/{lessonId}/attempts`.
- JSON fields camelCase. Dates ISO 8601 UTC strings. IDs are strings.
- Success: `200 { "data": T }`, create: `201 { "data": T }`, no content: `204`.
- Lists: `{ "data": T[], "nextCursor": string | null }`; query `?cursor=&limit=` (default 20, max 100).
- Errors: `{ "error": { "code": "UPPER_SNAKE", "message": "human readable", "details"?: {} } }`
  - 400 VALIDATION_FAILED (details = Zod issues), 401 UNAUTHENTICATED, 403 FORBIDDEN,
    404 NOT_FOUND, 409 CONFLICT / IDEMPOTENCY_REPLAY, 422 domain errors
    (INSUFFICIENT_MARGIN, MARKET_CLOSED, SYMBOL_HALTED, WORLD_LOCKED…), 429 RATE_LIMITED, 500 INTERNAL.
- Money: integers. `vmoney` in V Money units, prices as `pricePaise`. The app formats them.
- Localised content: return all three languages `{ en, hi, hx }` or honour `?lang=` — pick one
  approach per resource and document it in the OpenAPI description.
- Money-moving POSTs (orders, conversions, claims) require header `Idempotency-Key` (uuid).
  Same key + same body returns the original response; different body → 409.
- App auth: `Authorization: Bearer <Clerk session token>`. Admin pages use Clerk cookies.
- Never change a response shape silently. Additive changes are fine; breaking changes need a
  new field/route and a note in the contract changelog.
