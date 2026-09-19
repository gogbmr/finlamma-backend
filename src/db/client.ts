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
// Concurrent queries against this client (e.g. Promise.all([db.select()...,
// db.select()...])) can hang indefinitely rather than queue, once the
// connection has done enough prior sequential queries in the same process -
// reproduced while writing scripts/seed-roles.ts. Always await db calls one
// at a time; never Promise.all them.
// max: 1 is Supabase's own documented setting for serverless functions: this
// client is created once at module scope and reused across warm Vercel
// invocations, so a larger client-side pool can end up holding connections
// that Supavisor (the server-side pooler) has already recycled while the
// function was frozen - the next invocation then tries to use a dead
// connection and fails with an opaque, non-constraint query error instead
// of a clean one. Capping it at 1 means each invocation holds at most one
// connection, which the already-pooled Supavisor layer is designed for.
const queryClient = postgres(env.DATABASE_URL, { prepare: false, max: 1 });

export const db = drizzle({ client: queryClient, schema });
