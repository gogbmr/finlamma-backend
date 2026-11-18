"use client";

import {
  Award,
  BarChart3,
  BookOpen,
  ChevronDown,
  FileText,
  Flag,
  Gauge,
  Gift,
  Globe2,
  HelpCircle,
  MessageSquareText,
  Newspaper,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  visible: boolean;
};

export type AdminNavVisibility = {
  worlds: boolean;
  lessons: boolean;
  questions: boolean;
  mentors: boolean;
  consent: boolean;
  doubtZoneModeration: boolean;
  staff: boolean;
  activityLog: boolean;
  legal: boolean;
  settings: boolean;
  badges: boolean;
  rewards: boolean;
  coachNotes: boolean;
  instruments: boolean;
  opsConsole: boolean;
  newsDesk: boolean;
  competitions: boolean;
  analytics: boolean;
};

// One nav config, grouped, consumed by both the desktop sidebar and the
// tablet-width horizontal strip below - see AdminSidebar/AdminNavStrip.
// `visible` is computed server-side in the layout from the same
// permissions each page already enforces on its own (requireStaff/
// roleHasPermission) - this only ever HIDES a link, it never grants access;
// every page still independently checks permissions server-side regardless
// of what's shown here.
function navGroups(v: AdminNavVisibility): { label: string; items: NavItem[] }[] {
  return [
    {
      label: "Content",
      items: [
        { href: "/admin/worlds", label: "Worlds", icon: Globe2, visible: v.worlds },
        { href: "/admin/lessons", label: "Lessons", icon: BookOpen, visible: v.lessons },
        { href: "/admin/questions", label: "Questions", icon: HelpCircle, visible: v.questions },
        { href: "/admin/mentors", label: "Mentors", icon: Users, visible: v.mentors },
        { href: "/admin/news", label: "News Desk", icon: Newspaper, visible: v.newsDesk },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/admin/consent", label: "Consent", icon: ShieldCheck, visible: v.consent },
        {
          href: "/admin/doubt-zone",
          label: "Doubt Zone",
          icon: Flag,
          visible: v.doubtZoneModeration,
        },
        { href: "/admin/staff", label: "Staff", icon: Users, visible: v.staff },
        { href: "/admin/activity-log", label: "Activity Log", icon: ScrollText, visible: v.activityLog },
      ],
    },
    {
      label: "Legal",
      items: [{ href: "/admin/legal", label: "Legal", icon: FileText, visible: v.legal }],
    },
    {
      label: "Economy",
      items: [
        { href: "/admin/badges", label: "Badges", icon: Award, visible: v.badges },
        { href: "/admin/rewards", label: "Rewards", icon: Gift, visible: v.rewards },
        { href: "/admin/competitions", label: "Competitions", icon: Trophy, visible: v.competitions },
      ],
    },
    {
      label: "Trading",
      items: [
        { href: "/admin/instruments", label: "Instruments", icon: TrendingUp, visible: v.instruments },
        { href: "/admin/ops", label: "Ops Console", icon: Siren, visible: v.opsConsole },
      ],
    },
    {
      label: "Report Card",
      items: [
        {
          href: "/admin/coach-notes",
          label: "Coach Notes",
          icon: MessageSquareText,
          visible: v.coachNotes,
        },
      ],
    },
    {
      label: "Settings",
      items: [{ href: "/admin/settings", label: "Settings", icon: Settings, visible: v.settings }],
    },
    {
      label: "Analytics",
      items: [{ href: "/admin/analytics", label: "Analytics", icon: BarChart3, visible: v.analytics }],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible) }))
    .filter((group) => group.items.length > 0);
}

// Where / admin lands a signed-in staff member, in priority order - the
// first entry whose visibility flag is true wins. Analytics first (a
// read-only overview, the closest thing to a "home" page); everything else
// follows the same order as navGroups above. Kept here, next to
// AdminNavVisibility, so the landing choice and the sidebar never drift
// apart - see src/lib/admin/nav-visibility.ts and the root (dashboard)
// page.tsx.
export const ADMIN_LANDING_PRIORITY: {
  key: keyof AdminNavVisibility;
  href: string;
}[] = [
  { key: "analytics", href: "/admin/analytics" },
  { key: "worlds", href: "/admin/worlds" },
  { key: "lessons", href: "/admin/lessons" },
  { key: "questions", href: "/admin/questions" },
  { key: "mentors", href: "/admin/mentors" },
  { key: "newsDesk", href: "/admin/news" },
  { key: "consent", href: "/admin/consent" },
  { key: "doubtZoneModeration", href: "/admin/doubt-zone" },
  { key: "staff", href: "/admin/staff" },
  { key: "activityLog", href: "/admin/activity-log" },
  { key: "legal", href: "/admin/legal" },
  { key: "badges", href: "/admin/badges" },
  { key: "rewards", href: "/admin/rewards" },
  { key: "competitions", href: "/admin/competitions" },
  { key: "instruments", href: "/admin/instruments" },
  { key: "opsConsole", href: "/admin/ops" },
  { key: "coachNotes", href: "/admin/coach-notes" },
  { key: "settings", href: "/admin/settings" },
];

// Shared by NavLink, AdminNavStrip and AdminSidebar's collapse-override
// logic, so "is this item active" is defined exactly once.
function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

const NAV_COLLAPSE_STORAGE_KEY = "finlamma-admin-nav-collapsed-groups";

// Per-viewer convenience only (which groups are collapsed) - never read back
// by the server, never shared between staff members or devices. Read after
// mount (not in useState's initializer) so the very first render matches on
// both server and client - "everything expanded" - and collapsing from a
// stored preference only happens as a second, client-only update. Avoids a
// hydration mismatch instead of risking one for a cosmetic preference.
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Private window, blocked storage, corrupt value, ... - just keep
      // everything expanded.
    }
  }, []);

  function toggle(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        window.localStorage.setItem(
          NAV_COLLAPSE_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // Nothing to persist to - the toggle still works for this render.
      }
      return next;
    });
  }

  return { collapsed, toggle };
}

export function AdminSidebar({ visibility }: { visibility: AdminNavVisibility }) {
  const pathname = usePathname();
  const groups = navGroups(visibility);
  const { collapsed, toggle } = useCollapsedGroups();

  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      {groups.map((group) => {
        const hasActiveItem = group.items.some((item) =>
          isItemActive(pathname, item.href),
        );
        const isCollapsed = collapsed.has(group.label) && !hasActiveItem;

        return (
          <div key={group.label} className="space-y-1">
            <button
              type="button"
              onClick={() => toggle(group.label)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              {group.label}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90",
                )}
                aria-hidden
              />
            </button>
            {!isCollapsed && (
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// Flattened, horizontal, no group labels - used below the `lg` breakpoint
// where the full labeled sidebar is hidden, so navigation stays reachable
// down to tablet width without needing a drawer/toggle.
export function AdminNavStrip({ visibility }: { visibility: AdminNavVisibility }) {
  const pathname = usePathname();
  const items = navGroups(visibility).flatMap((group) => group.items);

  return (
    <nav
      aria-label="Admin"
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden"
    >
      {items.map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
