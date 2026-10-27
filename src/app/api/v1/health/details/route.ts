import { z } from "zod";
import { getStaffMember } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { checkRedisReachable } from "@/lib/redis";
import { env } from "@/lib/env";
import {
  checkAppUrl,
  checkClerkKeysNotSwapped,
  checkLegalDocuments,
  checkMarketDataProvider,
  checkMigrationsApplied,
  checkPushProvider,
  checkStorageConfigured,
  checkTradingHalt,
  checkTradingUnlockWorldMissing,
  checkWorldsMissingBossQuiz,
  currentVersion,
} from "../checks";

// App asks batch, item C1: the full diagnostic payload GET /api/v1/health
// used to return to anyone, now behind staff auth. Any active staff member
// can read this (not gated by a specific permission) - it's operational
// visibility in the same spirit as the Ops console's halt banner, which
// every admin page already shows regardless of permission, not a
// money/PII-sensitive view that needs its own narrower grant.
const HealthDetailsDataSchema = z.object({
  status: z.literal("ok").openapi({ example: "ok" }),
  database: z.literal("ok").openapi({ example: "ok" }),
  migrations: z.enum(["ok", "pending"]).openapi({
    example: "ok",
    description:
      "Whether the latest migration in drizzle/ has actually been applied to this database " +
      "(pnpm db:migrate) - catches deploying code that depends on a migration nobody ran yet. " +
      "Reported as data here (never a thrown error) - see GET /api/v1/health for the public " +
      "check that actually fails closed on this.",
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
      "'placeholder' means at least one currently published Terms/Privacy/Risk-disclosure " +
      "document is still the seeded pre-legal-review filler text (see " +
      "scripts/seed-legal-documents.ts); 'unpublished' means one of the three types has no " +
      "published version at all. Both must be resolved before launch.",
  }),
  version: z.string().openapi({
    example: "2d303f6",
    description:
      "The deployed commit's short SHA (Vercel's VERCEL_GIT_COMMIT_SHA, first 7 characters). " +
      "'local' outside Vercel (local dev, tests).",
  }),
  consentPiiHmacKey: z.enum(["ok", "missing"]).openapi({
    example: "ok",
    description:
      "'missing' means CONSENT_PII_HMAC_KEY isn't configured, so account deletion still scrubs " +
      "a minor's parent-contact PII but can't store the HMAC proof of which parent consented.",
  }),
  relaySecret: z.enum(["ok", "missing"]).openapi({
    example: "ok",
    description:
      "'missing' means RELAY_SHARED_SECRET isn't configured, so GET /api/v1/relay/config fails " +
      "closed for every call - the market relay can't fetch its instrument list/feed mode/holidays.",
  }),
  storage: z.enum(["ok", "missing"]).openapi({
    example: "ok",
    description:
      "'missing' means at least one of the S3_* env vars isn't configured, so src/lib/s3.ts " +
      "fails closed on any upload/download/signed-URL call.",
  }),
  redis: z.enum(["ok", "unreachable", "unconfigured"]).openapi({
    example: "ok",
    description:
      "'unconfigured' means UPSTASH_REDIS_REST_URL/TOKEN aren't set, 'unreachable' means " +
      "they're set but a live PING failed.",
  }),
  worldsMissingBossQuiz: z
    .array(z.object({ id: z.string().uuid(), title: z.string() }))
    .openapi({
      example: [],
      description: "Published worlds with no published Boss Quiz lesson - sequential world-unlock can never clear past one of these.",
    }),
  tradingUnlockWorldMissing: z.boolean().openapi({
    example: false,
    description: "True when fewer published worlds exist than settings_kv.lesson_flow_scoring.tradingUnlockAfterWorldPosition.",
  }),
  tradingHalt: z.enum(["ok", "active"]).openapi({
    example: "ok",
    description: "'active' means market_controls.global_halt is currently on - the order pad rejects every order.",
  }),
  market: z.enum(["configured", "mock", "unconfigured"]).openapi({
    example: "mock",
    description: "'configured' means a real market-data vendor is in effect; 'mock' means fixture prices; 'unconfigured' is a real misconfiguration.",
  }),
  push: z.enum(["configured", "mock", "unconfigured"]).openapi({
    example: "mock",
    description: "'configured' means a real push vendor (Expo) is in effect; 'mock' means sends are only logged.",
  }),
  appUrl: z.enum(["ok", "localhost", "empty", "mismatched_host"]).openapi({
    example: "ok",
    description: "APP_URL feeds every parent-consent/withdraw/re-approval email link and this deployment's own metadataBase/robots.txt/sitemap.xml.",
  }),
  inngest: z.enum(["ok", "unconfigured"]).openapi({
    example: "ok",
    description: "'unconfigured' on a real Vercel deployment means INNGEST_SIGNING_KEY is missing - background jobs never run.",
  }),
  timestamp: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
});

const HealthDetailsResponseSchema = registry.register(
  "HealthDetailsResponse",
  z.object({ data: HealthDetailsDataSchema }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/health/details",
  summary: "Full diagnostic health payload (staff only, app ask C1)",
  description:
    "Everything GET /api/v1/health used to return publicly - service config, mock/vendor " +
    "status, commit SHA, content warnings - now gated behind an active staff session. Open to " +
    "any active staff member, not a specific permission, since this is operational visibility " +
    "(same spirit as the Ops console's always-visible halt banner), not a money/PII-sensitive " +
    "view. Unlike the public endpoint, migrations/clerkKeys are reported as data here, never a " +
    "503 - a staff member diagnosing an issue wants the full picture, not to be blocked by it.",
  tags: ["System"],
  security: [{ clerkSession: [] }],
  responses: {
    200: {
      description: "The full diagnostic payload",
      content: { "application/json": { schema: HealthDetailsResponseSchema } },
    },
    401: {
      description: "Not signed in",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "UNAUTHENTICATED", message: "Staff sign-in required" } },
        },
      },
    },
    403: {
      description: "No active staff account for this session",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
          example: { error: { code: "FORBIDDEN", message: "No active staff account for this session" } },
        },
      },
    },
  },
});

export const GET = withErrors(async () => {
  const staff = await getStaffMember();
  if (!staff) {
    throw new AppError("FORBIDDEN", "No active staff account for this session");
  }

  const migrationsCheck = await checkMigrationsApplied();
  const clerkKeys = checkClerkKeysNotSwapped();
  const legalDocuments = await checkLegalDocuments();
  const worldsMissingBossQuiz = await checkWorldsMissingBossQuiz();
  const tradingUnlockWorldMissing = await checkTradingUnlockWorldMissing();
  const tradingHalt = await checkTradingHalt();
  const redis = await checkRedisReachable();
  // Matches src/lib/inngest.ts's own isDev logic: only a real Vercel
  // deployment (VERCEL_ENV set) is ever in Cloud mode and actually needs a
  // signing key - local dev is unconditionally fine.
  const inngest = !env.VERCEL_ENV || env.INNGEST_SIGNING_KEY ? ("ok" as const) : ("unconfigured" as const);

  return ok({
    status: "ok" as const,
    database: "ok" as const,
    migrations: migrationsCheck.ok ? ("ok" as const) : ("pending" as const),
    clerkKeys,
    legalDocuments,
    version: currentVersion(),
    consentPiiHmacKey: env.CONSENT_PII_HMAC_KEY ? ("ok" as const) : ("missing" as const),
    storage: checkStorageConfigured(),
    relaySecret: env.RELAY_SHARED_SECRET ? ("ok" as const) : ("missing" as const),
    market: checkMarketDataProvider(),
    push: checkPushProvider(),
    redis,
    worldsMissingBossQuiz,
    tradingUnlockWorldMissing,
    tradingHalt,
    appUrl: checkAppUrl(),
    inngest,
    timestamp: new Date().toISOString(),
  });
});
