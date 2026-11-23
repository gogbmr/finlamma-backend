// Seeds the fixed catalog of staff roles and permissions (see
// docs/PRODUCT_SPEC.md "Staff roles"). Idempotent - upserts by key, so it's
// safe to run again after adding a role/permission. Never removes an
// existing role, permission or grant, and never touches staff_members or
// users - it only adds/updates rows in roles, permissions and
// role_permissions. Run via `pnpm db:seed`.
//
// 2026-11-20: migrated from 28 coarse per-domain keys (worldN.manage/
// world.publish, etc.) to a uniform view/create/edit/delete scheme per
// admin resource (docs/ARCHITECTURE.md decision D81). The OLD keys are
// deliberately no longer listed here (so re-running this script stops
// re-touching them), but their rows and grants are NOT deleted from the
// live database by this change - every requireStaff()/roleHasPermission()
// call site across the codebase was swapped to the NEW keys in the same
// change, so the old rows simply become unused, harmless clutter rather
// than something still load-bearing. A follow-up migration to actually
// delete the old permission/role_permission rows is tracked in
// docs/ROADMAP.md, to run only once this branch is confirmed live on main
// (CLAUDE.md rule 8 - never remove something code elsewhere might still
// depend on before the code that stops depending on it is actually
// deployed).
//
// IMPORTANT naming note for world/lesson/question/mentor/news/coach_note
// (the six domains that used to have a separate draft-tier "X.manage" and
// a higher-trust "X.publish" permission): `delete` for these six is
// deliberately the FULL old "X.publish" bundle (publish, unpublish, the
// D20-style hotfix-while-published path, and the literal delete action
// where one exists) - not just "removes the row". This is what makes the
// migration below exactly preserve every role's existing access with zero
// widening: a role that could draft-edit but never publish still can't
// (gets `edit`, not `delete`); a role that could publish/unpublish/delete
// still can (gets `delete`, not `edit`) - same trust boundary, new names.
import "../envConfig";
import { logActivity } from "../src/lib/activity-log";
import { db } from "../src/db/client";
import { permissions, rolePermissions, roles } from "../src/db/schema";

const ROLES = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full access to every admin area, including staff management.",
  },
  {
    key: "user_manager",
    name: "User Manager",
    description: "Manages user accounts and support issues.",
  },
  {
    key: "content_uploader",
    name: "Content Uploader",
    description: "Uploads draft lessons, quizzes and news content.",
  },
  {
    key: "content_publisher",
    name: "Content Publisher",
    description: "Reviews and publishes draft content.",
  },
  {
    key: "quiz_maker",
    name: "Quiz Maker",
    description: "Creates and edits quiz questions.",
  },
] as const;

// Resource.op - every key below follows this shape. "view" is always
// required just to see the admin page at all (replaces the old implicit
// "either manage or publish grants view" rule with an explicit grant).
const PERMISSIONS = [
  // --- staff & roles (this feature itself) ---
  { key: "staff.view", description: "View the Staff admin page (list of staff members)." },
  { key: "staff.create", description: "Invite a new staff member." },
  { key: "staff.edit", description: "Edit a staff member's role or profile fields." },
  { key: "staff.delete", description: "Deactivate a staff member (never a hard delete)." },
  { key: "roles.view", description: "View the Roles admin page." },
  { key: "roles.create", description: "Create a new role." },
  { key: "roles.edit", description: "Rename/describe a role and assign its permissions." },
  { key: "roles.delete", description: "Delete a role, only while no staff member holds it." },

  // --- content domains with a draft/publish lifecycle: `delete` is the
  // old "X.publish" bundle (publish/unpublish/hotfix/delete), not just row
  // removal - see the file header comment. ---
  { key: "world.view", description: "View the Worlds admin page." },
  { key: "world.create", description: "Create a new world draft." },
  { key: "world.edit", description: "Edit a draft world's fields." },
  { key: "world.delete", description: "Publish, unpublish, hotfix or permanently delete a world." },

  { key: "lesson.view", description: "View the Lessons admin page." },
  { key: "lesson.create", description: "Create a new lesson draft." },
  { key: "lesson.edit", description: "Edit a draft lesson's fields." },
  { key: "lesson.delete", description: "Publish, unpublish, hotfix or permanently delete a lesson." },

  { key: "question.view", description: "View the Questions admin page." },
  { key: "question.create", description: "Create a new question draft." },
  { key: "question.edit", description: "Edit a draft question's fields." },
  { key: "question.delete", description: "Publish, unpublish, hotfix or permanently delete a question." },

  { key: "mentor.view", description: "View the Mentors admin page." },
  { key: "mentor.create", description: "Create a new mentor draft." },
  { key: "mentor.edit", description: "Edit a draft mentor's fields." },
  { key: "mentor.delete", description: "Publish, unpublish, hotfix or permanently delete a mentor." },

  { key: "news.view", description: "View the News Desk admin page." },
  { key: "news.create", description: "Draft a news story from an ingested raw item." },
  { key: "news.edit", description: "Edit a news story's draft fields, quality override or topic." },
  { key: "news.delete", description: "Toggle a news story's status (draft/published/hidden)." },

  { key: "coach_note.view", description: "View the Coach Notes admin page." },
  { key: "coach_note.create", description: "Create a new coach-note template draft." },
  { key: "coach_note.edit", description: "Edit a draft coach-note template." },
  { key: "coach_note.delete", description: "Publish or unpublish a coach-note template." },

  // --- single-tier content domains: one trust level, no separate
  // publish tier existed before, so `delete` is only defined where a real
  // destructive action already exists. ---
  { key: "badge.view", description: "View the Badges admin page." },
  { key: "badge.create", description: "Create a new badge draft." },
  { key: "badge.edit", description: "Edit, publish or unpublish a badge." },

  { key: "reward.view", description: "View the Rewards admin page." },
  { key: "reward.create", description: "Create a new reward draft." },
  { key: "reward.edit", description: "Edit, publish or unpublish a reward." },
  { key: "reward.delete", description: "Refund a learner's reward claim." },

  { key: "competition.view", description: "View the Competitions admin page." },
  { key: "competition.create", description: "Create a new competition draft." },
  { key: "competition.edit", description: "Edit or publish a competition, or its global settings." },

  { key: "instrument.view", description: "View the Instruments admin page." },
  { key: "instrument.create", description: "Add a new instrument to the catalog." },
  { key: "instrument.edit", description: "Edit the instrument catalog or market holiday calendar." },

  { key: "legal.view", description: "View the Legal documents admin page." },
  { key: "legal.create", description: "Draft a new version of a legal document." },
  { key: "legal.edit", description: "Edit or publish a draft legal document version." },

  // --- singleton/tunable domains: no create/delete concept. ---
  { key: "economy.view", description: "View the Settings page's economy section (V Money tuning)." },
  {
    key: "economy.edit",
    description: "Edit reward_rules defaults and the global V Money issuance multiplier.",
  },
  { key: "settings.view", description: "View the admin Settings page." },
  {
    key: "settings.edit",
    description: "Edit admin-tunable settings_kv values (lesson flow scoring, level curve, streaks, ...).",
  },

  // --- read-only domains. ---
  { key: "analytics.view", description: "View the admin analytics dashboards." },
  { key: "activity_log.view", description: "View the staff/user activity log." },

  // --- narrow, system-generated-record domains: no create/delete. ---
  {
    key: "consent.view",
    description:
      "View parental-consent and legal-acceptance status for user accounts, read-only. Every view " +
      "of a parent's contact details is logged.",
  },
  {
    key: "consent.edit",
    description:
      "Correct a learner's already-set date of birth. A correction that crosses the minor/adult " +
      "boundary re-evaluates the parental-consent gate live. Every correction is logged with " +
      "old/new value and a required reason.",
  },
  {
    key: "doubt_zone.view",
    description:
      "View flagged Doubt Zone AI messages - a message the safety classifier flagged, or one a " +
      "learner reported. Full, unflagged conversation transcripts are never browsable by staff.",
  },
  {
    key: "doubt_zone.edit",
    description: "Act on a flagged Doubt Zone message (resolve/escalate). Every view/action is logged.",
  },

  // --- controls, not records. ---
  {
    key: "ops.view",
    description: "View the Ops console, including the User Trading Ledger (every view is logged).",
  },
  {
    key: "ops.edit",
    description:
      "Ops console controls: global trading halt, per-symbol halt, feed-mode changes, risk-flag " +
      "thresholds. Every halt/unhalt requires a free-text reason.",
  },
] as const;

// Permissions granted to each role, by key. super_admin gets every
// permission that exists, explicitly listed (not an implicit wildcard) so
// role_permissions stays a readable audit trail of exactly what's granted.
// Other roles get permissions as their domain (quizzes, content, ...) is
// actually built in later phases. This mapping is the exact equivalent of
// what each role held under the old scheme (see the file header comment) -
// not a re-design of who can do what, only a rename/regranularization.
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: PERMISSIONS.map((p) => p.key),
  user_manager: ["consent.view", "doubt_zone.view", "doubt_zone.edit"],
  content_uploader: [
    "mentor.view",
    "mentor.create",
    "mentor.edit",
    "world.view",
    "world.create",
    "world.edit",
    "lesson.view",
    "lesson.create",
    "lesson.edit",
    "news.view",
    "news.create",
    "news.edit",
  ],
  content_publisher: [
    "mentor.view",
    "mentor.delete",
    "world.view",
    "world.delete",
    "lesson.view",
    "lesson.delete",
    "question.view",
    "question.delete",
    "instrument.view",
    "instrument.create",
    "instrument.edit",
    "news.view",
    "news.delete",
  ],
  quiz_maker: ["question.view", "question.create", "question.edit"],
};

async function seed() {
  for (const role of ROLES) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: role.name, description: role.description },
      });
  }

  for (const permission of PERMISSIONS) {
    await db
      .insert(permissions)
      .values(permission)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { description: permission.description },
      });
  }

  const [allRoles, allPermissions] = await Promise.all([
    db.select().from(roles),
    db.select().from(permissions),
  ]);
  const roleIdByKey = new Map(allRoles.map((r) => [r.key, r.id]));
  const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  let grantedCount = 0;
  for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) throw new Error(`Unknown role key in ROLE_PERMISSIONS: ${roleKey}`);
    for (const permissionKey of permissionKeys) {
      const permissionId = permissionIdByKey.get(permissionKey);
      if (!permissionId) {
        throw new Error(`Unknown permission key in ROLE_PERMISSIONS: ${permissionKey}`);
      }
      // .returning() comes back empty on a conflict (already granted), so
      // this only fires - and only logs - for a grant that's actually new.
      const inserted = await db
        .insert(rolePermissions)
        .values({ roleId, permissionId })
        .onConflictDoNothing({
          target: [rolePermissions.roleId, rolePermissions.permissionId],
        })
        .returning({ id: rolePermissions.id });

      if (inserted.length > 0) {
        grantedCount++;
        await logActivity({
          actorType: "system",
          action: "role.permission_granted",
          targetType: "role",
          targetId: roleId,
          metadata: { roleKey, permissionKey, source: "seed-roles" },
        });
      }
    }
  }

  console.log(
    `Seeded ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ` +
      `${grantedCount} new grant(s) logged.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
