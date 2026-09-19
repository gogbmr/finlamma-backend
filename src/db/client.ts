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
// max: 2, not 1 - see docs/ARCHITECTURE.md decision D13 for the full
// postmortem. Short version: with max: 1, two queries issued concurrently
// from the same request (e.g. Promise.all([db.select()..., db.select()...]))
// hang *forever*, with no error and no timeout, once the connection has
// carried a few prior queries. Confirmed by direct comparison: the exact
// same concurrent query pair resolves in 50ms against the session/direct
// connection (DATABASE_URL_DIRECT, port 5432, no pooler) and in 285ms
// against this same transaction pooler once max is 2, but hangs
// indefinitely against the transaction pooler at max: 1. Root cause:
// postgres.js pipelines concurrent queries onto a single logical
// connection, which assumes a continuous single backend - Supavisor's
// transaction mode can reassign the real backend between individual
// statements, so the client ends up waiting on a response that was framed
// for a connection the pooler already reassigned. This is a client/pooler
// protocol mismatch, not a slow query, which is exactly why it isn't
// caught by statement_timeout below (Postgres itself never sees a problem).
// max: 2 gives any accidental pair of concurrent queries within one
// request its own connection each, which sidesteps the single-connection
// pipelining path entirely - still a small, deliberately-bounded pool per
// serverless invocation (Supavisor is what makes many small per-invocation
// pools cheap in the first place), just not so small that one stray
// Promise.all silently wedges a request forever.
//
// connect_timeout/idle_timeout/statement_timeout are defense-in-depth for
// a different failure mode: a connection Supavisor has silently dropped
// (idle-recycled) while this module-scope client sat idle between warm
// Vercel invocations. Without them, the next query on a connection like
// that would hang with nothing to time the wait out; with them, it fails
// fast as a catchable error instead.
const queryClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 2,
  connect_timeout: 10,
  idle_timeout: 20,
  connection: {
    statement_timeout: 15_000,
  },
});

export const db = drizzle({ client: queryClient, schema });
