import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, logInternalError, ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
// Bundled at build time (resolveJsonModule) so this file is self-contained
// in the deployed serverless function - a runtime fs.readFileSync of
// drizzle/meta/_journal.json would risk not being traced into the bundle.
// Confirmed this actually happens: the built chunk for this route contains
// the journal's literal values inlined as a JS object, and Vercel's own
// file-tracing manifest (route.js.nft.json) never references drizzle/ at
// all - so there is no separate file this route depends on at runtime.
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
  clerkKeys: z.enum(["ok", "swapped", "unconfigured"]).openapi({
    example: "ok",
    description:
      "Whether NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (staff app) and CONSUMER_CLERK_PUBLISHABLE_KEY " +
      "(consumer app) resolve to two different Clerk applications, as they must - catches the " +
      "two being silently swapped or both pointed at the same app in env vars.",
  }),
  timestamp: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
});

// Decodes a Clerk publishable key's embedded Frontend API host. Format is
// pk_(test|live)_<base64(frontendApiHost + "$")> - see Clerk's publishable
// key docs. Both keys compared here are *publishable* (sent to every
// browser by design), so nothing secret is read, logged or returned.
function clerkInstanceHost(publishableKey: string): string | null {
  const base64Part = publishableKey.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = Buffer.from(base64Part, "base64").toString("utf8");
    return decoded.endsWith("$") ? decoded.slice(0, -1) : decoded;
  } catch {
    return null;
  }
}

// Catches the STAFF and CONSUMER Clerk applications' publishable keys
// silently resolving to the same Clerk instance - e.g. a copy-paste mistake
// in Vercel's env vars. clerkMiddleware()/auth() (src/lib/auth.ts
// getStaffMember()/requireStaff()) are bound only to the STAFF app; if its
// key actually points at the CONSUMER app instead, a real staff sign-in
// authenticates against the wrong Clerk application entirely, so the
// resulting clerk_user_id can never match a staff_members row - looking
// exactly like "this account isn't set up as staff" even when it is.
function checkClerkKeysNotSwapped(): "ok" | "swapped" | "unconfigured" {
  if (!env.CONSUMER_CLERK_PUBLISHABLE_KEY) return "unconfigured";

  const staffHost = clerkInstanceHost(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const consumerHost = clerkInstanceHost(env.CONSUMER_CLERK_PUBLISHABLE_KEY);
  if (!staffHost || !consumerHost) return "unconfigured";

  return staffHost === consumerHost ? "swapped" : "ok";
}

type MigrationsCheck = {
  ok: boolean;
  // Included in the 503 response's `details` when not ok, so a mismatch is
  // diagnosable from the health check's own output alone (e.g. distinguishing
  // "nobody ran db:migrate yet" from "this deployment is pointed at the wrong
  // database") without needing direct database access.
  expectedMigration: string;
  expectedAppliedAtMs: number;
  actualLatestAppliedAtMs: number | null;
};

// Compares the latest migration this deployment was built with against the
// latest one actually applied to the database (drizzle.__drizzle_migrations,
// drizzle-kit's own tracking table - a separate thing from Supabase's own
// migration tooling, which this project doesn't use). Not a byte-for-byte
// guarantee every intermediate migration matches, but it directly catches
// the case that matters: code shipped that depends on a migration nobody
// ran against the real database yet.
async function checkMigrationsApplied(): Promise<MigrationsCheck> {
  const latestEntry = migrationJournal.entries.at(-1);
  if (!latestEntry) {
    // No migrations exist yet - nothing to be behind on.
    return { ok: true, expectedMigration: "(none)", expectedAppliedAtMs: 0, actualLatestAppliedAtMs: null };
  }

  const [row] = await db.execute<{ latest: string | null }>(
    sql`select max(created_at)::bigint as latest from drizzle.__drizzle_migrations`,
  );
  const actualLatestAppliedAtMs = row?.latest ? Number(row.latest) : null;
  return {
    ok: actualLatestAppliedAtMs !== null && actualLatestAppliedAtMs >= latestEntry.when,
    expectedMigration: latestEntry.tag,
    expectedAppliedAtMs: latestEntry.when,
    actualLatestAppliedAtMs,
  };
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
  const clerkKeys = checkClerkKeysNotSwapped();
  if (clerkKeys === "swapped") {
    return fail(
      new AppError(
        "SERVICE_UNAVAILABLE",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CONSUMER_CLERK_PUBLISHABLE_KEY resolve to the " +
          "same Clerk application - the staff and consumer apps must be two separate Clerk " +
          "applications. Check these in Vercel's environment variables.",
      ),
    );
  }

  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    logInternalError("health.db_unreachable", err);
    return fail(new AppError("SERVICE_UNAVAILABLE", "Database is unreachable"));
  }

  let migrationsCheck: MigrationsCheck;
  try {
    migrationsCheck = await checkMigrationsApplied();
  } catch (err) {
    logInternalError("health.migrations_check_failed", err);
    return fail(new AppError("SERVICE_UNAVAILABLE", "Could not verify migrations"));
  }
  if (!migrationsCheck.ok) {
    return fail(
      new AppError("SERVICE_UNAVAILABLE", "Database migrations are pending - run pnpm db:migrate", {
        expectedMigration: migrationsCheck.expectedMigration,
        expectedAppliedAtMs: migrationsCheck.expectedAppliedAtMs,
        actualLatestAppliedAtMs: migrationsCheck.actualLatestAppliedAtMs,
      }),
    );
  }

  return ok({
    status: "ok" as const,
    database: "ok" as const,
    migrations: "ok" as const,
    clerkKeys,
    timestamp: new Date().toISOString(),
  });
});
