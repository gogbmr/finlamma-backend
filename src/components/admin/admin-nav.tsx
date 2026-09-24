"use client";

import {
  Award,
  BookOpen,
  FileText,
  Gauge,
  Gift,
  Globe2,
  HelpCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  staff: boolean;
  activityLog: boolean;
  legal: boolean;
  settings: boolean;
  badges: boolean;
  rewards: boolean;
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
      ],
    },
    {
      label: "People",
      items: [
        { href: "/admin/consent", label: "Consent", icon: ShieldCheck, visible: v.consent },
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
      ],
    },
    {
      label: "Settings",
      items: [{ href: "/admin/settings", label: "Settings", icon: Settings, visible: v.settings }],
    },
  ]
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible) }))
    .filter((group) => group.items.length > 0);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
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

export function AdminSidebar({ visibility }: { visibility: AdminNavVisibility }) {
  const pathname = usePathname();
  const groups = navGroups(visibility);

  return (
    <nav className="flex flex-col gap-5" aria-label="Admin">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      ))}
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
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
