"use client";

import { useEffect } from "react";
import { trackHomepageEvent } from "@/components/marketing/track-beacon";

// Mounted once on the homepage (src/app/page.tsx). A static, revalidate-300
// server component can't tell us a real visit happened on its own - it only
// re-runs once per revalidation window, not once per visitor - so an actual
// per-visit pageview count needs this one client-side beacon fire. No
// PostHog SDK or key involved; see track-beacon.ts.
export function HomepageAnalyticsBeacon() {
  useEffect(() => {
    trackHomepageEvent("homepage_viewed");
  }, []);

  return null;
}
