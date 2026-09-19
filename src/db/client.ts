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
const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle({ client: queryClient, schema });
