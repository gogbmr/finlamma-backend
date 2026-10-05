"use client";

import Link from "next/link";
import { trackHomepageEvent } from "@/components/marketing/track-beacon";
import { AppStoreBadgeIcon, GooglePlayBadgeIcon } from "@/components/marketing/store-badge-icons";

type Platform = "android" | "ios";

// PLACEHOLDER URLs - flip a value here to the real store listing once the
// app actually ships. Click tracking, hover states and layout are already
// wired, so that's a one-line change, not a rebuild. Deliberately `null`
// (not a dead "#" link) so the component itself renders a tappable, logged
// "interest" button instead of a broken link while the app isn't live yet.
const APP_STORE_URLS: Record<Platform, string | null> = {
  android: null, // e.g. "https://play.google.com/store/apps/details?id=..."
  ios: null, // e.g. "https://apps.apple.com/app/id..."
};

const BADGE_CLASS = "block h-11 w-auto transition hover:opacity-80 focus-visible:opacity-80";

function Badge({ platform, children }: { platform: Platform; children: React.ReactNode }) {
  const href = APP_STORE_URLS[platform];
  const onClick = () => trackHomepageEvent("app_store_link_clicked", platform);
  const label = platform === "android" ? "Get it on Google Play" : "Download on the App Store";

  if (href) {
    return (
      <Link href={href} className={BADGE_CLASS} onClick={onClick} aria-label={label}>
        {children}
      </Link>
    );
  }

  // Still clickable while there's no real link yet - a tap here is a
  // genuine interest signal (which platform visitors actually want) worth
  // measuring before the app ships, not just a disabled label.
  return (
    <button type="button" className={BADGE_CLASS} onClick={onClick} aria-label={`${label} (coming soon)`}>
      {children}
    </button>
  );
}

export function AppStoreBadges() {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:justify-start">
      <Badge platform="android">
        <GooglePlayBadgeIcon className="h-11 w-auto" />
      </Badge>
      <Badge platform="ios">
        <AppStoreBadgeIcon className="h-11 w-auto" />
      </Badge>
    </div>
  );
}
