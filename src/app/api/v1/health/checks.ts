// Shared health-check logic, used by both the trimmed public route
// (route.ts - status/db/migrations/clerk-key checks only, the ones that can
// actually fail the request) and the staff-gated diagnostic route
// (details/route.ts - every other warning field, app ask C1). Not a route
// itself (no route.ts filename), so this carries no routing meaning.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { logInternalError } from "@/lib/http";
import { LEGAL_DOCUMENT_TYPES, listPublishedDocuments } from "@/server/legal/repo";
import { listPublishedLessonsByWorldId } from "@/server/lessons/repo";
import { getMarketDataProviderKind } from "@/server/market/provider";
import { getPushProviderKind } from "@/server/notifications/provider";
import { getLessonFlowScoringSettings } from "@/server/settings/service";
import { getOrCreateMarketControls } from "@/server/trading/repo";
import { listPublishedWorlds } from "@/server/worlds/repo";
// Bundled at build time (resolveJsonModule) so this file is self-contained
// in the deployed serverless function - a runtime fs.readFileSync of
// drizzle/meta/_journal.json would risk not being traced into the bundle.
// Confirmed this actually happens: the built chunk for this route contains
// the journal's literal values inlined as a JS object, and Vercel's own
// file-tracing manifest (route.js.nft.json) never references drizzle/ at
// all - so there is no separate file this route depends on at runtime.
import migrationJournal from "../../../../../drizzle/meta/_journal.json";

// Vercel sets VERCEL_GIT_COMMIT_SHA automatically on every deployment (the
// full 40-char SHA) - not a secret, just the commit being built. Shortened
// to match how commit SHAs are normally displayed (git log --oneline,
// GitHub's UI). "local" outside Vercel, so this is never confused with a
// real deployed commit.
export function currentVersion(): string {
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
// Non-fatal: a missing/mocked market-data provider doesn't fail the health
// check (the API is still genuinely healthy - explore mode with mock data
// is a valid state while the founder confirms vendor cost, D38/D39), but it
// must never be silent - surfaced here the same way storage/redis are.
// Config-only, no live network call: getMarketDataProviderKind() reads env
// vars, never calls the vendor, so this check can't burn an API credit or
// add latency just from being asked.
export function checkMarketDataProvider(): "configured" | "mock" | "unconfigured" {
  if (env.MARKET_DATA_PROVIDER === "twelvedata" && !env.TWELVEDATA_API_KEY) return "unconfigured";
  return getMarketDataProviderKind() === "twelvedata" ? "configured" : "mock";
}

// Same shape/reasoning as checkMarketDataProvider - config-only, no live
// vendor call.
export function checkPushProvider(): "configured" | "mock" | "unconfigured" {
  if (env.PUSH_PROVIDER === "expo" && !env.EXPO_ACCESS_TOKEN) return "unconfigured";
  return getPushProviderKind() === "expo" ? "configured" : "mock";
}

export function checkStorageConfigured(): "ok" | "missing" {
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
export function checkClerkKeysNotSwapped(): "ok" | "swapped" | "unconfigured" {
  if (!env.CONSUMER_CLERK_PUBLISHABLE_KEY) return "unconfigured";

  const staffHost = clerkInstanceHost(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const consumerHost = clerkInstanceHost(env.CONSUMER_CLERK_PUBLISHABLE_KEY);
  if (!staffHost || !consumerHost) return "unconfigured";

  return staffHost === consumerHost ? "swapped" : "ok";
}

// Config-only, no network call. Non-fatal (never a 503) like every other
// warning field here - deliberately, since a wrong APP_URL doesn't make the
// API itself unhealthy, it silently breaks every consent/withdraw/
// re-approval email link and this deployment's own metadataBase/robots.txt/
// sitemap.xml instead, with nothing else catching it until a human happens
// to click a real link or inspect generated page output (which is exactly
// how this was first found - Phase 9 production verification, 2026-10-04).
export function checkAppUrl(): "ok" | "localhost" | "empty" | "mismatched_host" {
  let hostname: string;
  try {
    hostname = new URL(env.APP_URL).hostname;
  } catch {
    return "empty";
  }
  if (!hostname) return "empty";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";

  // Only a real Vercel deployment has a known expected host to compare
  // against - local dev's APP_URL legitimately IS localhost (already
  // caught above), and there's nothing to verify it against otherwise.
  if (!env.VERCEL_ENV) return "ok";

  const expectedHost =
    env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  // Fails open (same as every other config-only check here) if Vercel
  // hasn't surfaced the expected host either - this field exists to catch
  // APP_URL being wrong, not to require a second var just to confirm it's right.
  if (!expectedHost) return "ok";

  return hostname === expectedHost ? "ok" : "mismatched_host";
}

export type MigrationsCheck = {
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
export async function checkMigrationsApplied(): Promise<MigrationsCheck> {
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
export async function checkLegalDocuments(): Promise<"ok" | "placeholder" | "unpublished"> {
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
export async function checkWorldsMissingBossQuiz(): Promise<{ id: string; title: string }[]> {
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
export async function checkTradingUnlockWorldMissing(): Promise<boolean> {
  try {
    const settings = await getLessonFlowScoringSettings();
    const worlds = await listPublishedWorlds();
    return worlds.length < settings.tradingUnlockAfterWorldPosition;
  } catch (err) {
    logInternalError("health.trading_unlock_check_failed", err);
    return false;
  }
}

// Checkpoint 9 (docs/ARCHITECTURE.md D47): "confirm nothing can leave the
// system halted silently." Global halt should always be a deliberate,
// short-lived Ops action, never a forgotten switch - surfacing it here
// means it shows up in uptime/monitoring dashboards, not just the admin
// Ops console banner. Non-fatal (never a 503): degrades to "ok" on a check
// failure, same convention as every other DB-backed field here, since the
// failure itself is separately logged and visible.
export async function checkTradingHalt(): Promise<"ok" | "active"> {
  try {
    const controls = await getOrCreateMarketControls();
    return controls.globalHalt ? "active" : "ok";
  } catch (err) {
    logInternalError("health.trading_halt_check_failed", err);
    return "ok";
  }
}
