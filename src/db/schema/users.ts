import { date, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";

export const languageEnum = pgEnum("language", ["en", "hi", "hx"]);
export const themeEnum = pgEnum("theme", ["dark", "light"]);

// One row per Clerk identity. Clerk supports email, phone, Google, Apple and
// username sign-in on this app - a user may have email, phone, both, or
// (briefly, right after signup via username/OAuth with no contact info yet)
// neither, so both columns are nullable. Username itself is a Clerk login
// credential only and is never stored or shown - the public display name is
// always first_name + last_initial (kid-safe rule), which may also be null
// until onboarding collects a name.
export const users = pgTable("users", {
  ...idAndTimestamps(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  firstName: text("first_name"),
  lastInitial: varchar("last_initial", { length: 1 }),
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
  // Clerk's own updated_at for the last change we applied, so the Clerk
  // webhook can ignore an out-of-order/stale redelivery instead of
  // overwriting newer data with older data.
  clerkUpdatedAt: timestamp("clerk_updated_at", { withTimezone: true }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}).enableRLS();
