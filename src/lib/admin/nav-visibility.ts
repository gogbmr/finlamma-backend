import { getPermissionKeysForRole } from "@/server/staff/repo";

export type AdminNavVisibility = {
  worlds: boolean;
  lessons: boolean;
  questions: boolean;
  mentors: boolean;
  consent: boolean;
  doubtZoneModeration: boolean;
  staff: boolean;
  roles: boolean;
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

// Single source of truth for "which admin sections can this role see" -
// previously inlined in the dashboard layout only. Extracted so the root
// /admin page (see its page.tsx) can compute the exact same thing to decide
// where to land a staff member, without duplicating the permission-key list.
// One query (getPermissionKeysForRole already returns every key the role
// holds in one round trip - see docs/ARCHITECTURE.md D72), so calling this
// a second time from page.tsx never risks the concurrency-limit rule.
export async function computeAdminNavVisibility(
  roleId: string,
): Promise<AdminNavVisibility> {
  const grantedKeys = await getPermissionKeysForRole(roleId);

  return {
    worlds: grantedKeys.has("world.view"),
    lessons: grantedKeys.has("lesson.view"),
    questions: grantedKeys.has("question.view"),
    mentors: grantedKeys.has("mentor.view"),
    consent: grantedKeys.has("consent.view"),
    doubtZoneModeration: grantedKeys.has("doubt_zone.view"),
    staff: grantedKeys.has("staff.view"),
    roles: grantedKeys.has("roles.view"),
    activityLog: grantedKeys.has("activity_log.view"),
    legal: grantedKeys.has("legal.view"),
    settings: grantedKeys.has("settings.view"),
    badges: grantedKeys.has("badge.view"),
    rewards: grantedKeys.has("reward.view"),
    competitions: grantedKeys.has("competition.view"),
    coachNotes: grantedKeys.has("coach_note.view"),
    instruments: grantedKeys.has("instrument.view"),
    opsConsole: grantedKeys.has("ops.view"),
    newsDesk: grantedKeys.has("news.view"),
    analytics: grantedKeys.has("analytics.view"),
  };
}

// Where / admin lands a signed-in staff member, in priority order - the
// first entry whose visibility flag is true wins. Analytics first (a
// read-only overview, the closest thing to a "home" page); everything else
// follows the same order as navGroups in admin-nav.tsx. Lives here, not in
// admin-nav.tsx, because that file is "use client" - a Server Component
// (the root /admin page.tsx) importing a plain runtime value out of a
// "use client" module gets back an opaque client-reference stub instead of
// the real array (Next.js turns every export of a "use client" file into a
// client reference when a Server Component imports it, not just the
// components), which is exactly what broke `ADMIN_LANDING_PRIORITY.find`
// at runtime. This file has no "use client" directive, so it's safe to
// import a real value from on both the server and client side.
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
  { key: "roles", href: "/admin/roles" },
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
