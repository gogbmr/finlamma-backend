import { date, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { peerHandles } from "./peer_handles";

export const languageEnum = pgEnum("language", ["en", "hi", "hx"]);
export const themeEnum = pgEnum("theme", ["dark", "light"]);

// Small booleans, same "one jsonb column, not three" reasoning as
// LocalizedText - Settings' sound/haptics/data-saver toggles (SET-08/09/10)
// have no independent lifecycle, versioning or query need of their own, so a
// jsonb blob avoids three narrow columns for values nothing ever queries by.
// `cheersEnabled` (Phase 6, docs/ARCHITECTURE.md D53) joined this blob later
// than the other three - an existing row's stored jsonb predates the key and
// simply won't have it, so every reader treats a missing key as `true`
// (opt-out is the explicit `false`, never the absent case), never assuming
// the key exists.
export type UserPreferences = {
  sound: boolean;
  haptics: boolean;
  dataSaver: boolean;
  cheersEnabled: boolean;
};
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  sound: true,
  haptics: true,
  dataSaver: false,
  cheersEnabled: true,
};

// One row per Clerk identity. Clerk supports email, phone, Google, Apple and
// username sign-in on this app - a user may have email, phone, both, or
// (briefly, right after signup via username/OAuth with no contact info yet)
// neither, so both columns are nullable. Username itself is a Clerk login
// credential only and is never stored or shown. `firstName` is PRIVATE -
// returned only on GET /me, used in the parent-consent email, and on the
// learner's own certificate - never shown to another learner (D73,
// docs/ARCHITECTURE.md). `lastInitial` is retired: no longer written for
// any user (src/server/users/service.ts syncUserFromClerkEvent stopped
// passing it), kept only so an already-populated row isn't retroactively
// cleared. The actual peer-visible identity everywhere else (Arena,
// leaderboards, competitions, the activity feed) is `handleId` below.
export const users = pgTable("users", {
  ...idAndTimestamps(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  firstName: text("first_name"),
  lastInitial: varchar("last_initial", { length: 1 }),
  // D73: a staff-curated, non-learner-authored handle (peer_handles),
  // auto-assigned at account creation and backfilled for every pre-existing
  // user - this, never firstName/lastInitial, is what another learner ever
  // sees. Not unique - many learners can share the same handle by design
  // (it's a display value, not a lookup key). `restrict` on delete: staff
  // retire a handle (active: false) rather than delete one still assigned
  // to someone, same convention about_me_chips already uses.
  handleId: uuid("handle_id").references(() => peerHandles.id, { onDelete: "restrict" }),
  // Null until the learner's first self-reroll (PATCH /me/handle/reroll) -
  // the cooldown (30 days) is computed from this, never from `updatedAt`,
  // since plenty of other fields touch that column too.
  handleRerolledAt: timestamp("handle_rerolled_at", { withTimezone: true }),
  email: text("email").unique(),
  phone: text("phone").unique(),
  // Collected once at onboarding; drives the under-18 parental-consent gate
  // (see src/server/compliance). Set-once from the app - the service layer
  // rejects a second self-service PATCH once this is non-null. Only staff
  // can correct it afterwards, with a required reason, logged via
  // activity_logs (see docs/PRODUCT_SPEC.md's Onboarding & parental consent
  // section).
  dateOfBirth: date("date_of_birth"),
  // Set once, the first time the World Home mentor-intro modal finishes
  // (WH-11) - not the same as legal acceptance or parental consent, which
  // are tracked separately in src/server/legal and src/server/onboarding.
  // Purely a "have they seen the intro" flag; never cleared, never a gate
  // for requireFullAccess.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  language: languageEnum("language").default("hx").notNull(),
  theme: themeEnum("theme").default("dark").notNull(),
  // Free-text, self-editable, never shown publicly (D36 - Arena's public
  // profile shows the handle, not anything learner-authored - bio is a
  // Settings/account-page field, not a social one).
  bio: text("bio"),
  // Optional, self-editable (PATCH /me, same as bio/language/theme) - Phase 6
  // Arena's state-scope leaderboard (docs/PRODUCT_SPEC.md §3, FEATURE_MAP
  // AR-07) is the ONLY thing that ever reads this column. Never serialized
  // into any Arena response or public profile - it's read server-side only,
  // to bucket which state-scope pool a learner's own row belongs to. A
  // plain-language explanation of why it's asked belongs wherever the app
  // collects it, per the founder's decision. See docs/ARCHITECTURE.md's
  // Phase 6 kickoff decision for the state-scope privacy floor this column
  // exists to feed.
  state: text("state"),
  preferences: jsonb("preferences").$type<UserPreferences>().default(DEFAULT_USER_PREFERENCES).notNull(),
  // Clerk's own updated_at for the last change we applied, so the Clerk
  // webhook can ignore an out-of-order/stale redelivery instead of
  // overwriting newer data with older data.
  clerkUpdatedAt: timestamp("clerk_updated_at", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Set the instant DELETE /me is called, before anything else happens -
  // the durable "this account must end up deleted, no matter what" marker
  // (docs/STATUS.md's 2026-10-11 phase audit, account-deletion
  // reconciliation). requireUser() rejects any further request once this is
  // set (ACCOUNT_DELETION_PENDING), and the account-deletion Inngest
  // function/daily sweep (src/server/users/service.ts
  // reconcileAccountDeletion) keeps retrying until deletedAt is finally set
  // too. Never cleared once set - a non-null value here forever records
  // when deletion was first requested, same "permanent fact" reasoning as
  // deletedAt itself.
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
}).enableRLS();
