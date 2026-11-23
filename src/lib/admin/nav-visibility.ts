import { getPermissionKeysForRole } from "@/server/staff/repo";
import type { AdminNavVisibility } from "@/components/admin/admin-nav";

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
