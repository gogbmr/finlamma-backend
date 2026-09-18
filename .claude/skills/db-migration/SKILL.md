---
name: db-migration
description: Safe procedure for any database schema change with Drizzle — edit schema, generate migration, review SQL, then ask before applying. Use whenever a table, column, index or enum changes.
paths: "src/db/**, drizzle/**"
---

1. Edit the Drizzle schema in `src/db/schema/<domain>.ts`. Conventions: snake_case table and
   column names, `timestamptz` with `defaultNow()`, money as `bigint({ mode: "number" })`,
   translatable text as `jsonb` `{ en, hi, hx }`, explicit indexes for foreign keys and
   frequent filters, `onDelete` behaviour stated explicitly.
2. Run `pnpm db:generate`. Never hand-edit an existing file in `drizzle/`.
3. Open the generated SQL and review it. Flag to the user in plain English anything that:
   drops or renames a column/table, rewrites a large table, adds NOT NULL without a default,
   or changes a type. For renames, prefer add-new → backfill → switch reads → drop-old later.
4. Update `docs/DATA_MODEL.md` if the change is meaningful.
5. Ask the user before running `pnpm db:migrate`. Explain what will change.
6. After migrating, run the tests that touch the changed tables.
