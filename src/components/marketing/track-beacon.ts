"use client";

// Fires a homepage marketing event at our own POST /api/track, which is the
// only thing that ever calls PostHog for this (docs/ARCHITECTURE.md D69) -
// there is no PostHog key, and no PostHog SDK, anywhere in the browser
// bundle. Swallows every failure: a dropped beacon must never surface to
// the visitor or break the page.
export function trackHomepageEvent(
  event: "homepage_viewed" | "app_store_link_clicked",
  platform?: "ios" | "android",
): void {
  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, platform }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let a beacon failure affect the page.
  }
}
