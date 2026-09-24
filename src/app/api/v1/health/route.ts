import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, logInternalError, ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRedisReachable } from "@/lib/redis";
import { LEGAL_DOCUMENT_TYPES, listPublishedDocuments } from "@/server/legal/repo";
import { listPublishedLessonsByWorldId } from "@/server/lessons/repo";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { listPublishedWorlds } from "@/server/worlds/repo";
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
  legalDocuments: z.enum(["ok", "placeholder", "unpublished"]).openapi({
    example: "ok",
    description:
      "A non-fatal warning (never causes a 503): 'placeholder' means at least one currently " +
      "published Terms/Privacy/Risk-disclosure document is still the seeded pre-legal-review " +
      "filler text (see scripts/seed-legal-documents.ts); 'unpublished' means one of the three " +
      "types has no published version at all. Both must be resolved (a real version published " +
      "through the admin Legal document editor) before launch.",
  }),
  version: z.string().openapi({
    example: "2d303f6",
    description:
      "The deployed commit's short SHA (Vercel's VERCEL_GIT_COMMIT_SHA, first 7 characters), " +
      "so confirming what's actually live doesn't require the Vercel dashboard. 'local' outside " +
      "Vercel (local dev, tests).",
  }),
  consentPiiHmacKey: z.enum(["ok", "missing"]).openapi({
    example: "ok",
    description:
      "A non-fatal warning (never causes a 503): 'missing' means CONSENT_PII_HMAC_KEY isn't " +
      "configured, so account deletion still scrubs a minor's parent-contact PII but can't " +
      "store the HMAC proof of which parent consented - see src/server/onboarding/service.ts's " +
      "scrubConsentDataForDeletedUser.",
  }),
  storage: z.enum(["ok", "missing"]).openapi({
    example: "ok",
    description:
      "A non-fatal warning (never causes a 503): 'missing' means at least one of the S3_ENDPOINT/" +
      "S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY env vars isn't configured, so " +
      "src/lib/s3.ts fails closed (SERVICE_UNAVAILABLE) on any upload/download/signed-URL call - " +
      "e.g. mentor art, lesson media. Introduced after Phase 2b Checkpoint 1 shipped storage " +
      "plumbing with no way to notice a missing key from outside the deployment's env vars.",
  }),
  redis: z.enum(["ok", "unreachable", "unconfigured"]).openapi({
    example: "ok",
    description:
      "A non-fatal warning (never causes a 503): 'unconfigured' means UPSTASH_REDIS_REST_URL/" +
      "TOKEN aren't set, 'unreachable' means they're set but a live PING failed. Unlike storage, " +
      "src/lib/redis.ts's rate limiter fails OPEN when this isn't 'ok' (docs/ROADMAP.md Phase 3 " +
      "checkpoint 1) - the lesson step serve/answer endpoints stay usable, but this field is how " +
      "that gap is visible from outside the deployment's env vars.",
  }),
  worldsMissingBossQuiz: z
    .array(z.object({ id: z.string().uuid(), title: z.string() }))
    .openapi({
      example: [],
      description:
        "A non-fatal warning (never causes a 503): published worlds with no published Boss " +
        "Quiz lesson. Sequential world-unlock (GET /api/v1/worlds) can never clear past one of " +
        "these for any learner, since there's nothing to pass. See docs/ARCHITECTURE.md D24 " +
        "and STATUS.md.",
    }),
  tradingUnlockWorldMissing: z.boolean().openapi({
    example: false,
    description:
      "A non-fatal warning (never causes a 503): true when fewer published worlds exist than " +
      "settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition (default 3) - trading " +
      "stays locked for every learner until enough worlds are published. See " +
      "docs/ARCHITECTURE.md D25.",
  }),
  inngest: z.enum(["ok", "unconfigured"]).openapi({
    example: "ok",
    description:
      "A non-fatal warning (never causes a 503): 'unconfigured' means neither INNGEST_SIGNING_KEY " +
      "nor INNGEST_DEV is set, so the /api/inngest route's serve() handler is in the SDK's default " +
      "Cloud mode with no signing key - it will refuse every request (including legitimate ones " +
      "from Inngest) until one is set. Background jobs (the weekly report card, parent " +
      "re-approval emails) simply never run while this is 'unconfigured'.",
  }),
  timestamp: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
});

// Vercel sets VERCEL_GIT_COMMIT_SHA automatically on every deployment (the
// full 40-char SHA) - not a secret, just the commit being built. Shortened
// to match how commit SHAs are normally displayed (git log --oneline,
// GitHub's UI). "local" outside Vercel, so this is never confused with a
// real deployed commit.
function currentVersion(): string {
  return env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : "local";
}

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

// Non-fatal: a missing S3 var doesn't fail the health check (the API and
// database are still genuinely healthy), it's surfaced as a warning so a
// missing storage key is visible from the outside instead of only
// discovered the first time someone tries an upload in production - see
// src/lib/s3.ts's getS3Config(), which fails closed the same way
// getResendConfig() does for email.
function checkStorageConfigured(): "ok" | "missing" {
  const configured =
    env.S3_ENDPOINT &&
    env.S3_REGION &&
    env.S3_BUCKET &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY;
  return configured ? "ok" : "missing";
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

// Non-fatal: unlike checkMigrationsApplied, a bad result here never fails
// the health check with a 503 (the API is still genuinely healthy) - it's
// surfaced as a warning field so it's visible without needing DB access,
// same reasoning as the clerkKeys check. Defaults to the most attention-
// grabbing result ("unpublished") if the query itself fails, rather than
// silently reporting "ok".
async function checkLegalDocuments(): Promise<"ok" | "placeholder" | "unpublished"> {
  try {
    const published = await listPublishedDocuments();
    if (published.length < LEGAL_DOCUMENT_TYPES.length) return "unpublished";
    return published.some((d) => d.isPlaceholder) ? "placeholder" : "ok";
  } catch (err) {
    logInternalError("health.legal_documents_check_failed", err);
    return "unpublished";
  }
}

// Non-fatal, same reasoning as checkLegalDocuments: a published world with
// no published Boss Quiz lesson doesn't fail the health check (the API is
// still genuinely healthy), but it's a real content gap - the sequential
// world-unlock rule (src/server/worlds/service.ts's getPublicWorlds, D23/D24)
// can never let any learner clear past it. Defaults to an empty array (no
// warning) if the check itself throws, matching every other warning field's
// fail-open shape here, except reported via logInternalError so a genuine
// query failure is never silently indistinguishable from "all good".
async function checkWorldsMissingBossQuiz(): Promise<{ id: string; title: string }[]> {
  try {
    const worlds = await listPublishedWorlds();
    const missing: { id: string; title: string }[] = [];
    for (const world of worlds) {
      const lessons = await listPublishedLessonsByWorldId(world.id);
      if (!lessons.some((l) => l.kind === "boss_quiz")) {
        missing.push({ id: world.id, title: world.title.en });
      }
    }
    return missing;
  } catch (err) {
    logInternalError("health.boss_quiz_check_failed", err);
    return [];
  }
}

// Non-fatal, same reasoning as checkWorldsMissingBossQuiz: fewer published
// worlds than the configured trading-unlock position (D25,
// docs/ARCHITECTURE.md) doesn't fail the health check, but it means
// isTradingUnlocked() can never return true for anyone yet - a real content
// gap worth surfacing before Phase 4 wires trading up to this rule.
async function checkTradingUnlockWorldMissing(): Promise<boolean> {
  try {
    const settings = await getLessonFlowScoringSettings();
    const worlds = await listPublishedWorlds();
    return worlds.length < settings.tradingUnlockAfterWorldPosition;
  } catch (err) {
    logInternalError("health.trading_unlock_check_failed", err);
    return false;
  }
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

  const legalDocuments = await checkLegalDocuments();
  const worldsMissingBossQuiz = await checkWorldsMissingBossQuiz();
  const tradingUnlockWorldMissing = await checkTradingUnlockWorldMissing();
  const redis = await checkRedisReachable();
  const inngest = env.INNGEST_SIGNING_KEY || env.INNGEST_DEV ? ("ok" as const) : ("unconfigured" as const);

  return ok({
    status: "ok" as const,
    database: "ok" as const,
    migrations: "ok" as const,
    clerkKeys,
    legalDocuments,
    version: currentVersion(),
    consentPiiHmacKey: env.CONSENT_PII_HMAC_KEY ? ("ok" as const) : ("missing" as const),
    storage: checkStorageConfigured(),
    redis,
    worldsMissingBossQuiz,
    tradingUnlockWorldMissing,
    inngest,
    timestamp: new Date().toISOString(),
  });
});
