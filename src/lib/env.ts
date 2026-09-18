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

  // Observability - optional until we set up accounts (see docs/ROADMAP.md).
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
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
