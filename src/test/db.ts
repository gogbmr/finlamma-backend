import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

// A fresh, in-process Postgres (PGlite - real Postgres compiled to WASM,
// in-memory, no network, no files on disk) migrated to the current schema
// from drizzle/. Tests that need real Postgres behavior (constraints,
// ON CONFLICT, RLS, ...) mock @/db/client to return this instead of the
// real client - see src/server/users/repo.test.ts for the pattern. This
// keeps tests from ever touching the real Supabase database.
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
