---
name: db-migration
description: Safe procedure for any database schema change with Drizzle — edit schema, generate migration, review SQL, then ask before applying. Use whenever a table, column, index or enum changes.
paths: "src/db/**, drizzle/**"
---

1. Edit the Drizzle schema in `src/db/schema/<domain>.ts`. Conventions: snake_case table and
   column names, `timestamptz` with `defaultNow()`, money as `bigint({ mode: "number" })`,
   translatable text as `jsonb` `{ en, hi, hx }`, explicit indexes for foreign keys and
   frequent filters, `onDelete` behaviour stated explicitly, and `.enableRLS()` on every new
   table (no policies — defense in depth against the Supabase Data API, not app authorization;
   our server bypasses it as the table-owning role). Never use the Data API or `supabase-js`
   for data access.
2. Run `pnpm db:generate`. Never hand-edit an existing file in `drizzle/`.
3. Open the generated SQL and review it. Flag to the user in plain English anything that:
   drops or renames a column/table, rewrites a large table, adds NOT NULL without a default,
   or changes a type. For renames, prefer add-new → backfill → switch reads → drop-old later.
4. Update `docs/DATA_MODEL.md` if the change is meaningful.
5. Ask the user before running `pnpm db:migrate`. Explain what will change.
6. After migrating, run the tests that touch the changed tables.
7. **Never commit or push code that depends on a migration that hasn't been run against the
   real database yet** (a new column, table or constraint some route/service now reads or
   writes). A generated migration sitting unapplied in `drizzle/` while dependent code ships is
   exactly how a working local setup (migrations applied ad hoc during development) diverges
   from what's actually live - `GET /api/v1/health`'s `migrations` field exists specifically to
   catch this class of drift, but the fix is to run `pnpm db:migrate` before shipping, not to
   rely on the health check noticing after the fact.
