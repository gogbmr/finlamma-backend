import { Inter } from "next/font/google";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Site-wide admin "liquid glass" look (promoted from a /admin/worlds-only
// trial once the founder signed off on it there - see git history on
// src/app/admin/(dashboard)/worlds/glass.tsx for the original trial and its
// references: https://www.uistyleguide.com/style/glassmorphism and
// https://www.uistyleguide.com/style/liquid-glass for the design/layout
// technique, our own brand palette throughout, never the reference sites'
// colors). Every admin page under src/app/admin/(dashboard) uses this one
// shared recipe now - don't fork a second copy per domain.
//
// The actual "liquid glass" recipe: a flat bg-white/NN reads as "frosted
// white card", not glass - the real look comes from (a) a diagonal GRADIENT
// fill instead of a flat tint, mixing our own brand violet through at low
// opacity so the panel carries real color/texture rather than going pure
// white, (b) backdrop-saturate alongside backdrop-blur, which is what makes
// colors showing through the glass (the background blobs behind) look
// vivid instead of washed out, and (c) a dual shadow - a soft violet outer
// glow plus a 1px inset top highlight - for the glossy "light catching a
// glass edge" look a single shadow can't give. backdrop-saturate-150 (not
// the reference's 180%) and modest opacity stops - kept tasteful for a
// fintech admin tool, not a flashy consumer showcase.
//
// As of the shell/responsive redesign (phase 1), these point at real CSS
// classes in src/app/globals.css (.admin-glass-panel/-subtle) instead of an
// inline Tailwind utility string - same visual recipe, byte-for-byte, just
// moved so it can carry prefers-reduced-transparency and
// no-backdrop-filter-support fallbacks, which Tailwind v4 has no built-in
// variant for. Every page already using GLASS_PANEL/glassPanel(...) picks
// up those fallbacks automatically, with no per-page change needed.
export const GLASS_PANEL = "admin-glass-panel";

// A slightly less prominent variant for panels nested inside another glass
// panel (a sticky save bar, a reorder box, a KPI tile inside a console) -
// same recipe, lower opacity stops so two stacked blurred/tinted layers
// don't double up into mud.
export const GLASS_PANEL_SUBTLE = "admin-glass-panel-subtle";

// Chrome level - the sidebar and top bar (phase 1, new). More opaque than
// GLASS_PANEL above: permanent navigation needs to stay legible regardless
// of what's scrolling behind it, so this trades some transparency for
// reliability rather than reusing the content-panel recipe as-is.
export const GLASS_CHROME = "admin-glass-chrome";

export function glassPanel(className?: string) {
  return cn(GLASS_PANEL, className);
}

export function glassPanelSubtle(className?: string) {
  return cn(GLASS_PANEL_SUBTLE, className);
}

export function glassChrome(className?: string) {
  return cn(GLASS_CHROME, className);
}

// Font for the whole admin dashboard, scoped the same way it was during
// the worlds trial: the brand sheet (src/app/layout.tsx's comment) makes
// Poppins the one deliberate typeface for the public-facing site, so this
// does NOT touch that - Inter loads as its own font here and is applied via
// className on AdminGlassBackground's wrapper, which sets `font-family` on
// that subtree only (plain CSS inheritance), without changing <body>'s
// Poppins for the homepage/legal pages outside admin. Inter is the same
// face Linear/Vercel/GitHub/Stripe use for dense admin UI, built for
// small-size legibility in a way a display/brand face usually isn't.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
export const ADMIN_GLASS_FONT_CLASS = inter.className;

// A small "icon chip" - a soft violet gradient tile behind a lucide icon,
// used wherever a plain `bg-secondary` chip felt flat. Still lucide-react
// (already a dependency, the same set shadcn/ui ships with and already used
// everywhere in admin) - this is a presentation upgrade (gradient + a soft
// shadow, consistent sizing), not a different icon library.
export function GlassIconChip({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-violet-600 to-brand-violet-900 text-white shadow-[0_2px_8px_rgba(76,34,187,0.35)]",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

// Decorative, non-interactive background behind admin page content: a soft
// diagonal gradient through our own violet/lavender tones (never the
// reference site's vivid multi-hue one - still a fintech admin tool, not a
// consumer app) plus a few large, heavily blurred color blobs for depth,
// so the glass panels' blur actually has something to show through - on a
// flat single-color background, "glass" just reads as a faint grey box.
// `fixed` so it stays put while the page scrolls; `-z-10` and
// `pointer-events-none` so it never sits above or intercepts clicks; the
// admin shell's own opaque sidebar/header (bg-card, in layout.tsx, which
// this deliberately never touches) occlude it outside the content area
// without this needing to know that.
export function AdminGlassBackground({ children }: { children: ReactNode }) {
  return (
    <div className={cn(ADMIN_GLASS_FONT_CLASS, "relative")}>
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-brand-violet-100/70 to-background"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-violet-400/25 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand-violet-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-secondary/80 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
