import { z } from "zod";

// Validated once at boot. Only vars a Phase 0 module actually reads are
// required here — add more as later phases start using them (Clerk, S3,
// Redis, etc. already have placeholders in .env.example for that).
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Vercel sets this automatically on every deployment - unlike NODE_ENV
  // (which `next build` always sets to "production", preview deployments
  // included), this is the actual signal for "is this the real production
  // deployment". Absent outside Vercel (local dev, tests). See
  // src/server/onboarding/service.ts's sendConsentEmailOrLog for why this
  // distinction matters: a preview deployment must still be able to fall
  // back to console-logging an email link when Resend isn't configured.
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  // Also set automatically by Vercel (the full 40-char commit SHA being
  // built/deployed) - never set manually. Absent outside Vercel. Surfaced
  // (shortened) as GET /api/v1/health's `version` field so confirming what's
  // actually live doesn't require the Vercel dashboard - see
  // docs/STATUS.md's Phase 2a audit for why this was added.
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
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
  // The STAFF app's webhook: completes a staff invite (see
  // src/server/staff/service.ts inviteStaffMember()) into a staff_members
  // row on user.created, and deactivates one on user.deleted. Same
  // fail-closed-until-configured pattern as the consumer webhook above.
  STAFF_CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),

  // Email (parental-consent flow, Phase 2a) - optional until a Resend
  // domain is verified and an API key exists; src/lib/email.ts fails closed
  // with a clear error if a send is attempted before these are set, same
  // pattern as the Clerk webhook secrets above. EMAIL_FROM must use a
  // Resend-verified sending domain, e.g. "Finlamma <consent@mail.finlamma.in>".
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // HMAC key for scrubbing a deleted account's parent contact PII (see
  // scrubConsentDataForDeletedUser in src/server/onboarding/service.ts) -
  // lets us keep "was it this parent email?" verifiable in consent_records
  // after the raw email is anonymized, without storing the raw email.
  // Optional: if unset, deletion still proceeds (never blocks a user's
  // right to delete their account over an ops config gap) but skips
  // storing the HMAC and logs that gap server-side. Generate with
  // `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  // Not a Clerk/Resend/Supabase key - a value we invent ourselves, so there's
  // nothing to "get" from a dashboard, just generate and set it.
  CONSENT_PII_HMAC_KEY: z.string().optional(),

  // Storage (Supabase Storage via its S3-compatible API, see docs/ARCHITECTURE.md D4) - optional
  // until the bucket exists; src/lib/s3.ts fails closed with a clear error if used before these
  // are set, same lazy pattern as the Resend/Clerk-webhook vars above. The bucket is **private**
  // (Phase 2b decision, see docs/ARCHITECTURE.md) - lesson media, mentor art etc. are served only
  // via short-lived signed URLs minted by getSignedDownloadUrl(), never a public bucket URL.
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Redis (Upstash) - optional until a database exists; src/lib/redis.ts fails
  // OPEN (not closed) when unset, unlike S3/email above - see its own comment
  // for why: this is used for rate limiting a learning endpoint, and refusing
  // every learner's request because ops forgot a Redis var would be a worse
  // outage than the abuse vector it guards against. GET /api/v1/health's
  // `redis` field surfaces "unconfigured" so the gap is still visible.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

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
