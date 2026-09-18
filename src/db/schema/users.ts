import { pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
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
  language: languageEnum("language").default("hx").notNull(),
  theme: themeEnum("theme").default("dark").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}).enableRLS();
