// Store-badge iconography (src/components/marketing/app-store-badges.tsx).
//
// These are original recreations in the recognizable visual shape of the
// Google Play and Apple App Store badges (black pill, "eyebrow / wordmark"
// two-line text, a play-triangle / apple glyph) - not a traced copy of
// either company's own exported artwork, which we don't have redistribution
// rights to. They're built to read correctly at a glance, not to be a
// pixel-perfect trademark reproduction. Before a real launch, swap these for
// the actual badge assets from Google Play's and Apple's own badge-generator
// pages (both free, no account needed) - that's a drop-in replacement of
// just these two components, nothing else in app-store-badges.tsx changes.
export function GooglePlayBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 135 40" className={className} role="img" aria-hidden="true">
      <rect width="135" height="40" rx="7" fill="#000000" />
      <rect width="135" height="40" rx="7" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
      {/* Simplified play-triangle glyph, blue-to-green gradient - evokes the
          Play Store mark's silhouette without replicating its exact 4-colour
          geometry (see file comment above). */}
      <g transform="translate(13, 10)">
        <defs>
          <linearGradient id="gp-grad" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00c6ff" />
            <stop offset="1" stopColor="#3ddc84" />
          </linearGradient>
        </defs>
        <path d="M0 0 L20 10 L0 20 Z" fill="url(#gp-grad)" />
      </g>
      <text x="40" y="16" fill="#ffffff" fontSize="7.5" fontFamily="Arial, sans-serif" letterSpacing="0.6">
        GET IT ON
      </text>
      <text x="40" y="30" fill="#ffffff" fontSize="14" fontFamily="Arial, sans-serif" fontWeight="600">
        Google Play
      </text>
    </svg>
  );
}

export function AppStoreBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 135 40" className={className} role="img" aria-hidden="true">
      <rect width="135" height="40" rx="7" fill="#000000" />
      <rect width="135" height="40" rx="7" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
      {/* Simplified apple-with-leaf silhouette (built from arcs, not traced
          bezier art) - evokes the glyph without replicating Apple's own
          artwork (see file comment above). */}
      <g transform="translate(14, 8)" fill="#ffffff">
        <path d="M11.8 4.2c-1.1-1.3-2.7-1.4-3.3-1.4-.1 1.3.4 2.3 1 3 .6.8 1.6 1.4 2.7 1.3.1-1.2-.3-2.1-.4-2.9z" />
        <path d="M12.9 6.6c-1.5-.9-2.9-.3-3.6 0-.9.4-1.7.3-2.6 0-1.2-.4-2.5-.4-3.6.3-1.5.9-2.4 2.6-2.4 4.5 0 2.1.9 4.3 2 6 .6.9 1.3 1.9 2.3 1.9.9 0 1.3-.6 2.4-.6s1.4.6 2.4.6c1 0 1.7-.9 2.3-1.8.5-.7.8-1.4 1.1-2.1-1.4-.6-2.3-1.9-2.3-3.5 0-1.3.6-2.5 1.6-3.3-.5-.6-1.1-1.1-1.6-1z" />
      </g>
      <text x="40" y="16" fill="#ffffff" fontSize="7.5" fontFamily="Arial, sans-serif" letterSpacing="0.2">
        Download on the
      </text>
      <text x="40" y="30" fill="#ffffff" fontSize="14.5" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="500">
        App Store
      </text>
    </svg>
  );
}
