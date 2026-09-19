import { z } from "zod";

// Validated once at boot. Only vars a Phase 0 module actually reads are
// required here — add more as later phases start using them (Clerk, S3,
// Redis, etc. already have placeholders in .env.example for that).
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_URL: z.string().url(),

  // Supabase Postgres: pooled connection for the app at runtime, direct
  // session connection for drizzle-kit migrations.
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url(),

  // Clerk - two separate Clerk applications, never one. Staff/admin is the
  // only side that ever carries a session cookie on this domain, so it
  // owns the conventional env var names that clerkMiddleware()/auth()/
  // <ClerkProvider> read implicitly. The mobile app's users are verified
  // manually (see requireUser() in src/lib/auth.ts) via @clerk/backend's
  // authenticateRequest() against the CONSUMER_* keys below - this never
  // touches clerkMiddleware/auth() at all, so there's no session-cookie
  // handshake between the two instances on this domain. See
  // docs/ARCHITECTURE.md decision D2.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),
  // Optional until the second (consumer) Clerk application exists and its
  // keys are added - requireUser() fails closed (503) until then, the same
  // pattern as CLERK_WEBHOOK_SIGNING_SECRET below.
  CONSUMER_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CONSUMER_CLERK_SECRET_KEY: z.string().optional(),
  // Optional until the Clerk webhook endpoint exists and has a signing
  // secret to put here - it needs the deployed route URL first. This is
  // the CONSUMER app's webhook (it syncs `users`, not `staff_members`).
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),

  // Observability - optional until we set up accounts (see docs/ROADMAP.md).
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
});

function loadEnv() {
  // .env.example ships empty placeholders for vars we haven't set up yet
  // (e.g. SENTRY_DSN=). Treat "present but empty" the same as "unset" so
  // optional fields don't fail validation just because the placeholder exists.
  const withoutEmptyStrings = Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [
      key,
      value === "" ? undefined : value,
    ]),
  );
  const parsed = envSchema.safeParse(withoutEmptyStrings);
  if (!parsed.success) {
    console.error(
      "Invalid environment variables:",
      z.flattenError(parsed.error).fieldErrors,
    );
    throw new Error(
      "Invalid environment variables. Check .env.local against .env.example.",
    );
  }
  return parsed.data;
}

export const env = loadEnv();
