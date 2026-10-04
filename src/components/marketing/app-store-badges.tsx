"use client";

import Link from "next/link";
import { trackHomepageEvent } from "@/components/marketing/track-beacon";

type Platform = "android" | "ios";

// Flip a value here to the real store listing URL once the app actually
// ships - click tracking and layout are already wired, so that's a
// one-line change, not a rebuild.
const APP_STORE_URLS: Record<Platform, string | null> = {
  android: null,
  ios: null,
};

const LABELS: Record<Platform, string> = {
  android: "Coming soon on Android",
  ios: "Coming soon on iOS",
};

const BADGE_CLASS =
  "rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20";

function Badge({ platform }: { platform: Platform }) {
  const href = APP_STORE_URLS[platform];

  if (href) {
    return (
      <Link
        href={href}
        className={BADGE_CLASS}
        onClick={() => trackHomepageEvent("app_store_link_clicked", platform)}
      >
        {LABELS[platform]}
      </Link>
    );
  }

  // Still clickable while there's no real link yet - a tap here is a
  // genuine interest signal (which platform visitors actually want) worth
  // measuring before the app ships, not just a disabled label.
  return (
    <button
      type="button"
      className={BADGE_CLASS}
      onClick={() => trackHomepageEvent("app_store_link_clicked", platform)}
    >
      {LABELS[platform]}
    </button>
  );
}

export function AppStoreBadges() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
      <Badge platform="android" />
      <Badge platform="ios" />
    </div>
  );
}
