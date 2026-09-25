import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { checkRateLimit, type RateLimitConfig } from "@/lib/redis";

// Generous for a single legitimate caller (the relay, polling its config
// periodically) while still meaningfully throttling brute-force guessing
// of RELAY_SHARED_SECRET - defense in depth on top of the secret's own
// entropy, not the only thing standing between a guesser and a match.
// failOpen: false (checked below) because this limiter's real job is
// bounding guess attempts, a security control, not just abuse prevention -
// see src/lib/redis.ts's own reasoning for REWARD_CLAIM_RATE_LIMIT, the
// same failOpen: false judgment call for the same reason (an unbounded
// guess budget is worse than a rare false-positive block, especially since
// a relay outage already degrades gracefully - stale/missing prices are
// PRICE_STALE/PRICE_UNAVAILABLE at order time, not a silent danger).
const RELAY_CONFIG_RATE_LIMIT: RateLimitConfig = {
  requests: 30,
  window: "60 s",
  prefix: "ratelimit:relay-config",
};

// Never a plain `a === b` or byte-by-byte early-exit compare (timing side
// channel - see D40, docs/ARCHITECTURE.md). Hashing both sides first, THEN
// comparing with node:crypto's timingSafeEqual, sidesteps the one gap
// timingSafeEqual has on its own: it throws (and a naive caller might
// branch) on mismatched-length inputs, which itself leaks the secret's
// length. SHA-256 digests are always 32 bytes regardless of input length,
// so this comparison is constant-time and constant-shape no matter what
// the caller sends - a 3-character guess and a 3,000-character guess take
// the identical code path.
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// GET /api/v1/relay/config's only guard. Throws SERVICE_UNAVAILABLE if
// RELAY_SHARED_SECRET itself isn't configured (an ops gap, not a caller
// mistake - same lazy-fail-closed pattern as S3/Resend), RATE_LIMITED if
// the caller's exceeded the guess budget above, or UNAUTHENTICATED with no
// further detail (never "missing header" vs "wrong secret" vs anything
// about the value) for a missing or incorrect X-Relay-Secret header. Never
// logs the header value or the configured secret, in this function or in
// any error it throws - every message here is a fixed string.
export async function requireRelaySecret(req: Request): Promise<void> {
  if (!env.RELAY_SHARED_SECRET) {
    throw new AppError("SERVICE_UNAVAILABLE", "Relay authentication is not configured");
  }

  const { allowed } = await checkRateLimit("relay-config", RELAY_CONFIG_RATE_LIMIT, false);
  if (!allowed) {
    throw new AppError("RATE_LIMITED", "Too many requests");
  }

  const provided = req.headers.get("X-Relay-Secret");
  if (!provided || !safeEqual(provided, env.RELAY_SHARED_SECRET)) {
    throw new AppError("UNAUTHENTICATED", "Unauthorized");
  }
}
