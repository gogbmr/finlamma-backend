# Status

## 2026-09-19 — Phase 0-1 audit (`/phase-audit 0-1`)

Audited: Phase 0 (project setup), Phase 1 (identity, roles, activity log).

**Result: PASS. All checks green, both Medium and one Low security finding fixed, and the
production DATABASE_URL misconfiguration this audit surfaced has been corrected and re-verified.**

### What passed
- Every ticked Phase 0/1 roadmap item traced to real, working code.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` (116 tests, 0 failed/skipped) / `pnpm build` all clean.
- All 4 Drizzle migrations applied and schema-matching in the `rzymlgyhifphdsqnczsm` Supabase
  project; RLS enabled on all 6 tables; Supabase advisors clear above INFO level.
- `openapi/openapi.json` / `docs/API_ENDPOINTS.md` current; every route authenticated (or
  intentionally public) and every mutation logged via `logActivity()`.
- Production: `/api/v1/me` returns 401 without a token, both Clerk webhooks return 400 unsigned,
  `/admin` redirects signed-out visitors to `/admin/sign-in`.
- security-auditor over Phase 0-1: 0 Critical/High findings.

### Fixed as a result of this audit
- **(Security, Medium)** Staff lockout: `setStaffMemberActive`/`changeStaffMemberRole` now refuse
  an action that would leave zero active holders of `staff.manage` (was previously possible to
  self-deactivate/self-demote with no recovery path). `src/server/staff/service.ts`.
- **(Security, Medium)** Health check logged raw driver errors unscrubbed; now routed through the
  same `logInternalError` scrubbing every other DB-touching path uses. `src/lib/http.ts` (export),
  `src/app/api/v1/health/route.ts`.
- **(Security, Low)** `roleId` wasn't validated against the `roles` table before use in
  `inviteStaffMember`/`changeStaffMemberRole` - now returns a clean `NOT_FOUND` instead of an
  unhandled FK-violation 500.
- **(Production diagnosability)** `/api/v1/health`'s 503 now includes `details` (expected vs.
  actually-applied migration identifiers) instead of just a generic message - this is what
  surfaced the root cause below within a minute of deploying.

### Production issue - resolved 2026-09-19
`GET /api/v1/health` was returning 503 with `actualLatestAppliedAtMs: null`, meaning production's
`DATABASE_URL`/`DATABASE_URL_DIRECT` pointed at a database with an empty
`drizzle.__drizzle_migrations` table - not the `rzymlgyhifphdsqnczsm` Supabase project this audit
verified has all 4 migrations applied and a matching schema. Two other theories (Vercel
file-tracing missing `drizzle/meta/_journal.json`; CRLF causing a content-hash mismatch) were
investigated and ruled out with direct evidence - see the `8145527` commit message.

You corrected the Vercel production environment variables and redeployed. Re-verified same day:
```json
{"data":{"status":"ok","database":"ok","migrations":"ok","timestamp":"2026-09-19T15:07:21.821Z"}}
```

### Your actions
- **Clerk dashboard**, staff application: confirm public sign-up is disabled (invite-only). The
  code already only grants a `staff_members` row via a signed invite, so this is defense-in-depth
  only, not a live hole.

### Follow-ups (tracked, not fixed now)
- **(Security, Low)** Account deletion can leave a user "stuck" between Clerk-deleted and
  DB-anonymized if the second step throws (`src/server/users/service.ts` `deleteMe()`, comment at
  line 52). Needs a reconciliation job - revisit once Inngest exists (Phase 7).
