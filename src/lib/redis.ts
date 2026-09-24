import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { logInternalError } from "@/lib/http";

// Created lazily inside getRedisClient() (not at module scope) so importing
// this file doesn't require UPSTASH_REDIS_REST_URL/TOKEN to be configured
// yet - same lazy pattern as getS3Config() in src/lib/s3.ts. Unlike S3
// though, callers here decide fail-open vs fail-closed for themselves (see
// checkRateLimit's `failOpen` option) rather than this file always throwing
// when unconfigured - a learning endpoint's rate limit is a defense-in-depth
// guard, not something that should take the whole endpoint down if ops
// forgot a Redis var, whereas a future money-spending endpoint (reward
// claims, trading) needs the opposite: refuse rather than risk unlimited
// spend when the guard itself can't be checked.
function getRedisClient(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

export type RateLimitWindow = `${number} ms` | `${number} s` | `${number} m` | `${number} h` | `${number} d`;

export type RateLimitConfig = {
  requests: number;
  window: RateLimitWindow;
  // Namespaces this limiter's keys in Redis so unrelated call sites (or a
  // future money-spending limiter reusing the same Redis database) never
  // collide - see @upstash/ratelimit's own `prefix` option.
  prefix: string;
};

export type RateLimitResult = {
  allowed: boolean;
  // false when Redis is unconfigured, or a check against it failed/timed
  // out - lets a caller distinguish "genuinely under the limit" from
  // "couldn't check", which matters for anything that must fail closed.
  configured: boolean;
};

// Sliding-window check for `identifier` (always a user id here - never an
// IP, matching src/lib/http.ts's requestMeta rule that x-forwarded-for is
// informational-only and never used for auth/rate-limit decisions, since a
// client behind a proxy can supply it). `failOpen: true` (learning
// endpoints, per docs/ROADMAP.md's Phase 3 rate-limiting item) allows the
// request through when Redis is unconfigured or the check itself throws,
// logging so the gap is visible without ever blocking every learner over an
// ops config issue. `failOpen: false` (money-spending endpoints - reward
// claims, later trading) does the opposite: refuses the request whenever
// the limit genuinely can't be verified, on the theory that an unbounded
// spend vector is worse than a rare false-positive block.
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  failOpen: boolean,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) {
    if (!failOpen) return { allowed: false, configured: false };
    console.warn(`[redis] UPSTASH_REDIS_REST_URL/TOKEN not configured - rate limit "${config.prefix}" skipped`);
    return { allowed: true, configured: false };
  }

  try {
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.requests, config.window),
      prefix: config.prefix,
    });
    const { success } = await ratelimit.limit(identifier);
    return { allowed: success, configured: true };
  } catch (err) {
    if (!failOpen) {
      logInternalError("redis.ratelimit_check_failed", err);
      return { allowed: false, configured: true };
    }
    logInternalError("redis.ratelimit_check_failed_fail_open", err);
    return { allowed: true, configured: true };
  }
}

// Non-fatal health check: a real PING against Redis, never throws. Mirrors
// src/app/api/v1/health/route.ts's other "ok"/"missing"-shaped checks
// (checkStorageConfigured, etc.) - "unreachable" (configured but a live
// ping failed) is distinguished from "unconfigured" (no env vars at all)
// since they point at different fixes (an outage vs. a missing var).
export async function checkRedisReachable(): Promise<"ok" | "unreachable" | "unconfigured"> {
  const redis = getRedisClient();
  if (!redis) return "unconfigured";
  try {
    await redis.ping();
    return "ok";
  } catch (err) {
    logInternalError("health.redis_check_failed", err);
    return "unreachable";
  }
}

// Shared by the lesson step serve/answer endpoints (docs/ROADMAP.md Phase
// 3's first item, docs/STATUS.md 2026-09-22 phase-2b-audit entry) - the two
// endpoints a learner naturally alternates between while working through a
// lesson. 30 requests/10s per user is generous for legitimate fast-paced
// quiz play (a multi-choice question answered in 1-2s is normal) while
// still stopping a tight scripted loop from farming XP once Phase 3
// Checkpoint 2 wires real crediting. Not precision-tuned - revisit once
// real usage data exists, the same way docs/ECONOMY.md treats its reward
// values as a starting point, not a permanent constant.
export const LESSON_STEP_RATE_LIMIT: RateLimitConfig = {
  requests: 30,
  window: "10 s",
  prefix: "ratelimit:lesson-step",
};

// src/server/rewards/service.ts's claimReward - a money-spending endpoint,
// so this is always called with failOpen: false (src/lib/redis.ts's own
// checkRateLimit doc comment names reward claims as exactly the case that
// needs this). A generous-but-real cap: legitimate use is a handful of
// claims ever, not a tight per-second budget like the lesson-step limiter.
export const REWARD_CLAIM_RATE_LIMIT: RateLimitConfig = {
  requests: 10,
  window: "60 s",
  prefix: "ratelimit:reward-claim",
};
