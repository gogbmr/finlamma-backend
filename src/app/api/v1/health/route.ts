import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { fail, logInternalError, ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkClerkKeysNotSwapped, checkMigrationsApplied, type MigrationsCheck } from "./checks";

// App asks batch, item C1 (pre-launch checklist): trimmed to `status` only
// - every other field (service config, mock/vendor status, commit SHA,
// content warnings) was a config/version fingerprint handed to anyone who
// requested this URL with no auth at all. The same diagnostic payload now
// lives behind staff auth at GET /api/v1/health/details.
const HealthDataSchema = z.object({
  status: z.literal("ok").openapi({ example: "ok" }),
});

const HealthResponseSchema = registry.register("HealthResponse", z.object({ data: HealthDataSchema }));

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  summary: "Health check",
  description:
    "Confirms the API is running, can reach the database, and has every migration applied. " +
    "Used by uptime monitors - deliberately returns nothing beyond `status` (app ask C1); the " +
    "full diagnostic payload (service config, mock/vendor status, commit SHA, content " +
    "warnings) is behind staff auth at GET /api/v1/health/details.",
  tags: ["System"],
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
    503: {
      description: "Database is unreachable, migrations are pending, or the Clerk keys are misconfigured",
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

  return ok({ status: "ok" as const });
});
