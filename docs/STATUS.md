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

## 2026-09-19 — Production admin access-denied incident

`/admin` showed "Access denied: your account isn't set up as an active staff member" for a real
staff Clerk user id, right after the DATABASE_URL fix above.

**Root cause: `staff_members` was completely empty in production** - never bootstrapped (expected
for a first-time setup; nobody had run `pnpm seed:super-admin` against the corrected database
yet). Not a Clerk misconfiguration: added a `clerkKeys` field to `/api/v1/health` (decodes both
publishable keys' embedded Frontend API host and compares them - both are public-by-design, so
nothing secret is read) specifically to rule out the STAFF and CONSUMER Clerk apps' keys being
silently swapped, since that would produce this exact symptom too. Production confirmed
`"clerkKeys":"ok"` - the two apps are correctly separate.

**Fixed:** ran the equivalent of `scripts/seed-super-admin.ts` as raw SQL in Supabase's SQL
Editor (my Supabase MCP connection is read-only, so I prepared the SQL and the user ran it):
inserted a `staff_members` row (`id d8db1463-2c7f-4cd9-8533-9357ffd40be9`,
`clerk_user_id user_3JXs4KAH4UsDUDQNKsJTe2jOg03`, role `super_admin`, `active: true`) plus the
matching `staff.bootstrap_super_admin` activity_logs entry. Both verified via the read-only MCP
connection afterward. `/admin` confirmed working.

**Shipped as a result:**
- `/api/v1/health`'s `clerkKeys` check (`ok` / `swapped` / `unconfigured`) - catches the staff and
  consumer Clerk apps' publishable keys being silently pointed at the same instance, which would
  make a real staff sign-in authenticate against the wrong Clerk application and look exactly like
  "not set up as staff" even when the `staff_members` row is correct.

### Webhook re-verification against the corrected database
The original audit only checked that unsigned requests get rejected with 400, not the real
signed-event → DB-write path, and that hadn't been re-tested since the DATABASE_URL fix.

**Staff webhook (`/api/webhooks/clerk-staff`): verified, real invite + real delete.** The user
invited a throwaway test email (`quiz_maker` role) from `/admin/staff`, accepted it, then deleted
the test account in the Clerk dashboard. Full trail confirmed via Supabase, all consistent and in
order:
| Time (UTC) | Event | Evidence |
|---|---|---|
| 15:40:22 | Invite sent | `staff.invited`, actor = the super_admin seeded above, target `inv_3JYKB66Nt4KnneZittFr8W7stZ9` |
| 15:44:19.8 | Real `user.created` webhook on accept | `staff_members` row `b950044d-...`, `role_id` = `quiz_maker` (matches invite) |
| 15:44:20.2 | Invite completion logged | `staff.joined_via_invite` |
| 15:46:05.2 | Real `user.deleted` webhook on delete | `staff_members.active` → `false` |
| 15:46:06.6 | Deactivation logged | `staff.deactivated_from_clerk` |

A real accepted invite is stronger evidence than Clerk's synthetic "Send Example" events - it only
reaches `completeStaffInviteFromClerkEvent` at all if signature verification, `public_metadata`
role-reading, and the DB write all worked correctly end to end.

**Consumer webhook (`/api/webhooks/clerk`): not yet re-verified.** Still needs a real signup +
delete via the consumer Clerk app's Account Portal (no app UI exists yet to drive this).
