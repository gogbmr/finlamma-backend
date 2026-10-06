import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Tests must never open a connection to the real Supabase database. Every
// test that needs a real Postgres mocks this module to point at the
// in-process PGlite instance from src/test/db.ts instead (see
// src/server/users/repo.test.ts for the pattern). If this file is still
// reached with NODE_ENV=test, that mock is missing - fail loudly here
// rather than risk a test silently touching production data.
if (env.NODE_ENV === "test") {
  throw new Error(
    "src/db/client.ts was imported in a test without being mocked. " +
      "Tests must use the PGlite test database from src/test/db.ts, never DATABASE_URL - see CLAUDE.md.",
  );
}

// Transaction pool mode (Supabase pooler, port 6543) does not support
// prepared statements or connection-level state, so prepare is disabled.
//
// max: 4 - see docs/ARCHITECTURE.md decisions D13 and D72 for the full
// postmortem of why this number is load-bearing, not a round default.
// Short version: postgres.js pipelines concurrent queries beyond `max`
// onto an already-busy logical connection, assuming a continuous single
// backend - Supabase's Supavisor transaction-mode pooler can reassign the
// real backend between individual statements, so the client ends up
// waiting on a response that was framed for a connection the pooler
// already reassigned. The connection then wedges FOREVER and is never
// reclaimed (confirmed: neither idle_timeout nor max_lifetime below ever
// revisit a connection that's busy/stuck, only a genuinely idle one) -
// this is a client/pooler protocol mismatch, not a slow query, which is
// exactly why it isn't caught by statement_timeout either (Postgres
// itself never sees a problem).
//
// max: 1 hung on a concurrent PAIR (D13, found first). max: 2 then hung on
// a concurrent TRIPLE (D72, 2026-10-06 production incident - a real admin
// page running one query alongside a Promise.all of two more). An audit
// after D72 found the SAME pattern at up to 23 concurrent queries in
// several other places (this file's own admin-shell permission check
// among them) - raising `max` enough to cover the worst case directly
// (23) is not safe either: Supavisor's project-level pool_size is a hard
// ceiling (15 at the time of D72's investigation) shared with PostgREST/
// pg_cron/pg_net/the metrics exporter AND every other concurrent Vercel/
// Inngest instance, each holding its own `max`-sized pool - a single
// instance alone at max: 23 would nearly exhaust that entire shared budget.
//
// So max: 4 is deliberately a SAFETY MARGIN, not a number sized to cover
// every known call site directly - the actual prevention is
// src/lib/concurrency-limit.ts's runWithConcurrencyLimit (DB_CONCURRENCY_LIMIT,
// kept equal to this value - cross-checked below, not just by convention),
// applied at every call site a request-time audit or
// scripts/check-promise-all-db-concurrency.ts's ongoing mechanical scan
// found issuing more than this many concurrent queries. This number should
// be revisited with real production concurrency data (Vercel's dashboard
// shows live concurrent execution counts) once there's real traffic -
// see docs/STATUS.md's D72 account for the full arithmetic.
//
// connect_timeout/idle_timeout/statement_timeout are a separate concern:
// defense-in-depth for a connection Supavisor has silently dropped
// (idle-recycled) while this module-scope client sat idle between warm
// Vercel invocations. Without them, the next query on a connection like
// that would hang with nothing to time the wait out; with them, it fails
// fast as a catchable error instead. They do nothing for the wedging
// failure mode above - confirmed, see D72 - since that connection is
// never idle from postgres.js's own point of view.
const queryClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 4,
  connect_timeout: 10,
  idle_timeout: 20,
  connection: {
    statement_timeout: 15_000,
  },
});

export const db = drizzle({ client: queryClient, schema });
