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
    worlds: grantedKeys.has("world.manage") || grantedKeys.has("world.publish"),
    lessons:
      grantedKeys.has("lesson.manage") || grantedKeys.has("lesson.publish"),
    questions:
      grantedKeys.has("question.manage") || grantedKeys.has("question.publish"),
    mentors:
      grantedKeys.has("mentor.manage") || grantedKeys.has("mentor.publish"),
    consent: grantedKeys.has("consent.view"),
    doubtZoneModeration: grantedKeys.has("doubt_zone.moderate"),
    staff: grantedKeys.has("staff.manage"),
    activityLog: grantedKeys.has("activity_log.view"),
    legal: grantedKeys.has("legal.manage"),
    settings: grantedKeys.has("settings.manage"),
    badges: grantedKeys.has("economy.manage"),
    rewards: grantedKeys.has("economy.manage"),
    competitions: grantedKeys.has("economy.manage"),
    coachNotes:
      grantedKeys.has("coach_note.manage") ||
      grantedKeys.has("coach_note.publish"),
    instruments: grantedKeys.has("instrument.manage"),
    opsConsole: grantedKeys.has("trading.ops"),
    newsDesk: grantedKeys.has("news.manage") || grantedKeys.has("news.publish"),
    analytics: grantedKeys.has("analytics.view"),
  };
}
