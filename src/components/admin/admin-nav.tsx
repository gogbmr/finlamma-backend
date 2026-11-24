"use client";

import {
  Award,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Flag,
  Gauge,
  Gift,
  Globe2,
  HelpCircle,
  KeyRound,
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
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import type { AdminNavVisibility } from "@/lib/admin/nav-visibility";

// Re-exported so existing imports of the type from this file (e.g.
// layout.tsx) keep working - a type-only re-export erases at compile time,
// so it never hits the "use client" client-reference issue that moved
// AdminNavVisibility's definition and ADMIN_LANDING_PRIORITY's value to
// src/lib/admin/nav-visibility.ts in the first place (see that file).
export type { AdminNavVisibility };

type NavItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  visible: boolean;
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
        { href: "/admin/roles", label: "Roles", icon: KeyRound, visible: v.roles },
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

// Shared by NavLink, AdminNavStrip and AdminSidebar's collapse-override
// logic, so "is this item active" is defined exactly once.
function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

// `rail` renders an icon-only link with a CSS-only hover/focus tooltip
// (no tooltip primitive exists in this codebase yet, and none was approved
// to add one - group-hover/group-focus-visible on a plain absolutely-
// positioned span does the whole job without a dependency). Only the
// desktop sidebar ever passes `rail` - the mobile drawer always renders
// full labeled links, same as before.
function NavLink({
  item,
  pathname,
  rail = false,
}: {
  item: NavItem;
  pathname: string;
  rail?: boolean;
}) {
  const active = isItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors",
        rail ? "justify-center px-2 py-2" : "px-3 py-2",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {rail ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-2 rounded-md border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          {item.label}
        </span>
      ) : (
        item.label
      )}
    </Link>
  );
}

const NAV_COLLAPSE_STORAGE_KEY = "finlamma-admin-nav-collapsed-groups";
const EMPTY_COLLAPSED_GROUPS: Set<string> = new Set();

// Per-viewer convenience only (which groups are collapsed) - never read back
// by the server, never shared between staff members or devices.
// useSyncExternalStore (not useEffect+setState, which the lint config flags
// as a cascading-render anti-pattern for exactly this "read an external
// store on mount" case - see the same fix already applied in
// src/app/legal/[type]/legal-document-client.tsx) - getServerSnapshot always
// returns the same empty-Set constant ("everything expanded"), so SSR/
// hydration never touches localStorage and the server-rendered markup
// always matches the client's first paint; collapsing from a stored
// preference only happens as a second, client-only read.
//
// A plain useSyncExternalStore getSnapshot must return a stable (===)
// value when nothing changed, or it re-renders forever - so the parsed Set
// is cached and only rebuilt when the underlying localStorage string
// actually changes.
let cachedRaw: string | null = null;
let cachedSnapshot: Set<string> = EMPTY_COLLAPSED_GROUPS;
const listeners = new Set<() => void>();

function readRawCollapsedGroups(): string | null {
  try {
    return window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY);
  } catch {
    // Private window, blocked storage, ... - just keep everything expanded.
    return null;
  }
}

function getCollapsedGroupsSnapshot(): Set<string> {
  const raw = readRawCollapsedGroups();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSnapshot = raw ? new Set(JSON.parse(raw) as string[]) : EMPTY_COLLAPSED_GROUPS;
    } catch {
      // Corrupt stored value - keep everything expanded.
      cachedSnapshot = EMPTY_COLLAPSED_GROUPS;
    }
  }
  return cachedSnapshot;
}

function getServerCollapsedGroupsSnapshot(): Set<string> {
  return EMPTY_COLLAPSED_GROUPS;
}

function subscribeToCollapsedGroups(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function toggleCollapsedGroup(label: string) {
  const next = new Set(getCollapsedGroupsSnapshot());
  if (next.has(label)) next.delete(label);
  else next.add(label);

  const raw = JSON.stringify([...next]);
  try {
    window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, raw);
  } catch {
    // Nothing to persist to - the toggle still works for this render.
  }
  cachedRaw = raw;
  cachedSnapshot = next;
  for (const listener of listeners) listener();
}

function useCollapsedGroups() {
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedGroups,
    getCollapsedGroupsSnapshot,
    getServerCollapsedGroupsSnapshot,
  );
  return { collapsed, toggle: toggleCollapsedGroup };
}

// Desktop-only "icon rail" collapse for the whole sidebar width (distinct
// from the per-group collapse above - its own localStorage key, its own
// cache) - same hydration-safe useSyncExternalStore shape as
// useCollapsedGroups: getServerSnapshot always returns the fixed "not
// collapsed" default, so SSR/hydration never touches localStorage and the
// server-rendered markup always matches the client's first paint; the
// stored preference is only applied as a second, client-only read. Never
// used by the mobile drawer (AdminSidebar's `allowRailCollapse={false}`
// there) - a drawer is already as narrow as it'll get, collapsing it
// further to icons would just make a cramped drawer worse.
const NAV_RAIL_STORAGE_KEY = "finlamma-admin-nav-rail-collapsed";

let cachedRailRaw: string | null = null;
let cachedRailSnapshot = false;
const railListeners = new Set<() => void>();

function readRawRailCollapsed(): string | null {
  try {
    return window.localStorage.getItem(NAV_RAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getRailCollapsedSnapshot(): boolean {
  const raw = readRawRailCollapsed();
  if (raw !== cachedRailRaw) {
    cachedRailRaw = raw;
    cachedRailSnapshot = raw === "1";
  }
  return cachedRailSnapshot;
}

function getServerRailCollapsedSnapshot(): boolean {
  return false;
}

function subscribeToRailCollapsed(onStoreChange: () => void) {
  railListeners.add(onStoreChange);
  return () => railListeners.delete(onStoreChange);
}

function setRailCollapsed(next: boolean) {
  const raw = next ? "1" : "0";
  try {
    window.localStorage.setItem(NAV_RAIL_STORAGE_KEY, raw);
  } catch {
    // Nothing to persist to - the toggle still works for this render.
  }
  cachedRailRaw = raw;
  cachedRailSnapshot = next;
  for (const listener of railListeners) listener();
}

function useRailCollapsed() {
  const collapsed = useSyncExternalStore(
    subscribeToRailCollapsed,
    getRailCollapsedSnapshot,
    getServerRailCollapsedSnapshot,
  );
  return { collapsed, setCollapsed: setRailCollapsed };
}

// `allowRailCollapse` defaults to true (the desktop `<aside>`'s own use);
// the mobile drawer passes false so it always renders the full labeled nav
// regardless of the desktop-only rail preference stored in localStorage.
export function AdminSidebar({
  visibility,
  allowRailCollapse = true,
}: {
  visibility: AdminNavVisibility;
  allowRailCollapse?: boolean;
}) {
  const pathname = usePathname();
  const groups = navGroups(visibility);
  const { collapsed, toggle } = useCollapsedGroups();
  const { collapsed: railCollapsedStored, setCollapsed: setRailCollapsed } = useRailCollapsed();
  const rail = allowRailCollapse && railCollapsedStored;

  return (
    <nav className="flex h-full flex-col gap-1" aria-label="Admin">
      <div className={cn("flex flex-col gap-1", rail && "items-center")}>
        {groups.map((group) => {
          const hasActiveItem = group.items.some((item) => isItemActive(pathname, item.href));
          const isCollapsed = !rail && collapsed.has(group.label) && !hasActiveItem;

          return (
            <div key={group.label} className={cn("space-y-1", rail ? "w-full" : undefined)}>
              {!rail && (
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
              )}
              {(rail || !isCollapsed) && (
                <div className={cn("space-y-1", rail && "flex flex-col items-center")}>
                  {group.items.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} rail={rail} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allowRailCollapse && (
        <button
          type="button"
          onClick={() => setRailCollapsed(!railCollapsedStored)}
          aria-label={railCollapsedStored ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            rail && "justify-center",
          )}
        >
          {railCollapsedStored ? (
            <ChevronsRight className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <ChevronsLeft className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {!rail && "Collapse"}
        </button>
      )}
    </nav>
  );
}
