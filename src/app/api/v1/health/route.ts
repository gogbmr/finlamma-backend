import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { fail, ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
// Bundled at build time (resolveJsonModule) so this file is self-contained
// in the deployed serverless function - a runtime fs.readFileSync of
// drizzle/meta/_journal.json would risk not being traced into the bundle.
import migrationJournal from "../../../../../drizzle/meta/_journal.json";

const HealthDataSchema = z.object({
  status: z.literal("ok").openapi({ example: "ok" }),
  database: z.literal("ok").openapi({ example: "ok" }),
  migrations: z.enum(["ok", "pending"]).openapi({
    example: "ok",
    description:
      "Whether the latest migration in drizzle/ has actually been applied to this database " +
      "(pnpm db:migrate) - catches deploying code that depends on a migration nobody ran yet.",
  }),
  timestamp: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
});

// Compares the latest migration this deployment was built with against the
// latest one actually applied to the database (drizzle.__drizzle_migrations,
// drizzle-kit's own tracking table - a separate thing from Supabase's own
// migration tooling, which this project doesn't use). Not a byte-for-byte
// guarantee every intermediate migration matches, but it directly catches
// the case that matters: code shipped that depends on a migration nobody
// ran against the real database yet.
async function areMigrationsApplied(): Promise<boolean> {
  const latestLocal = migrationJournal.entries.at(-1)?.when;
  if (latestLocal === undefined) return true; // no migrations exist yet

  const [row] = await db.execute<{ latest: string | null }>(
    sql`select max(created_at)::bigint as latest from drizzle.__drizzle_migrations`,
  );
  const latestApplied = row?.latest ? Number(row.latest) : null;
  return latestApplied !== null && latestApplied >= latestLocal;
}

const HealthResponseSchema = registry.register("HealthResponse", z.object({ data: HealthDataSchema }));

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  summary: "Health check",
  description: "Confirms the API is running and can reach the database. Used by uptime monitors.",
  tags: ["System"],
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
    503: {
      description: "Database is unreachable",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: {
            error: { code: "SERVICE_UNAVAILABLE", message: "Database is unreachable" },
          },
        },
      },
    },
  },
});

export const GET = withErrors(async () => {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    console.error("Health check: database ping failed", err);
    return fail(new AppError("SERVICE_UNAVAILABLE", "Database is unreachable"));
  }

  let migrationsOk: boolean;
  try {
    migrationsOk = await areMigrationsApplied();
  } catch (err) {
    console.error("Health check: migrations check failed", err);
    return fail(new AppError("SERVICE_UNAVAILABLE", "Could not verify migrations"));
  }
  if (!migrationsOk) {
    return fail(
      new AppError("SERVICE_UNAVAILABLE", "Database migrations are pending - run pnpm db:migrate"),
    );
  }

  return ok({
    status: "ok" as const,
    database: "ok" as const,
    migrations: "ok" as const,
    timestamp: new Date().toISOString(),
  });
});
