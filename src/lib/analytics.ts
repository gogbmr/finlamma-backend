import { after } from "next/server";
import { PostHog } from "posthog-node";
import { env } from "@/lib/env";
import { logInternalError } from "@/lib/http";

// No module-level caching - same lazy-construct-on-every-call pattern as
// getRedisClient() (src/lib/redis.ts): importing this file never requires
// POSTHOG_API_KEY to be set, and each call re-checks env rather than
// freezing a decision from the first call forever.
function getClient(): PostHog | null {
  if (!env.POSTHOG_API_KEY) return null;
  return new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
    // Serverless (Vercel) functions can freeze/exit right after the handler
    // returns - flush every event immediately rather than batching, so
    // there's nothing left buffered when the function is torn down.
    flushAt: 1,
    flushInterval: 0,
  });
}

// docs/ARCHITECTURE.md D69: a fixed, deliberately short list. Adding a new
// value here is the only way to add a new event - this union is the
// enforcement mechanism that keeps the event list from growing into fifty
// noisy ones, and the review point for "does this event risk carrying PII,
// Doubt Zone content, or anything we'd be uncomfortable explaining to a
// parent" before it ships.
export type AnalyticsEvent =
  | "session_started"
  | "signup_completed"
  | "lesson_completed"
  | "world_completed"
  | "boss_quiz_passed"
  | "boss_quiz_failed"
  | "trade_order_placed"
  | "pulse_check_finished"
  | "streak_broken"
  | "arena_cheer_sent"
  | "entitlement_purchased"
  // Pre-full-access onboarding funnel (D69) - anonymous internal id only,
  // never PII, never used for targeting. See docs/ARCHITECTURE.md D69 and
  // the pre-launch legal-review checklist item it's tied to.
  | "onboarding_dob_entered"
  | "onboarding_consent_requested"
  | "onboarding_consent_completed"
  // Public marketing homepage only (anonymous visitor, no account) -
  // forwarded via POST /api/track, never a client-side PostHog SDK call.
  | "homepage_viewed"
  | "app_store_link_clicked";

type AnalyticsProperties = Record<string, string | number | boolean | null>;

// Fire-and-forget, server-side only - never throws, never awaited by the
// caller, never adds latency to the response it's called from.
//
// `distinctId` must never be PII: always our own internal `users.id` (an
// opaque UUID PostHog can't reverse into a name/email on its own), or a
// fresh crypto.randomUUID() for a fully anonymous visitor (the homepage
// beacon). Never pass name/email/DOB/parent-contact/bio/Doubt-Zone content
// as a property, and never call posthog.identify() with a real attribute -
// see docs/ARCHITECTURE.md D69 for the full reasoning.
//
// Schedules the actual network call via Next's after() so it runs once the
// response has already been sent, instead of racing a bare fire-and-forget
// promise against the serverless runtime freezing the function right after
// return (which can silently drop the event). Falls back to a plain
// fire-and-forget when called outside a request context (e.g. an Inngest
// job), where after() isn't available.
export function captureEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  const posthog = getClient();
  if (!posthog) return;

  const send = async () => {
    try {
      posthog.capture({ distinctId, event, properties });
      await posthog.flush();
    } catch (err) {
      logInternalError("analytics.capture_failed", err);
    }
  };

  try {
    after(send);
  } catch (err) {
    logInternalError("analytics.after_unavailable", err);
    void send();
  }
}
