import type { ReactElement } from "react";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { AppError } from "./errors";

type SendEmailInput = {
  to: string;
  subject: string;
  react: ReactElement;
};

// Created lazily inside sendEmail (not at module scope) so importing this
// file doesn't require RESEND_API_KEY/EMAIL_FROM to be configured yet -
// same lazy-fail-closed pattern as getConsumerClerkClient() in
// src/lib/auth.ts. EMAIL_FROM must be a Resend-verified sending domain.
function getResendConfig() {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return null;
  return { client: new Resend(env.RESEND_API_KEY), from: env.EMAIL_FROM };
}

// Thin wrapper over Resend - domain code (src/server/compliance) builds the
// actual React email templates and calls this to send them. Never logs the
// Resend error body (may include recipient PII), only its name/message.
export async function sendEmail(input: SendEmailInput) {
  const config = getResendConfig();
  if (!config) {
    throw new AppError("SERVICE_UNAVAILABLE", "Email sending is not configured");
  }

  const { error } = await config.client.emails.send({
    from: config.from,
    to: input.to,
    subject: input.subject,
    react: input.react,
  });

  if (error) {
    console.error("Resend send failed:", error.name, error.message);
    throw new AppError("SERVICE_UNAVAILABLE", "Could not send email right now");
  }
}

// Deliberately checks VERCEL_ENV, not NODE_ENV: `next build` always sets
// NODE_ENV=production, on a Vercel preview deployment too, so gating on
// NODE_ENV alone would make the dev fallback below unreachable on preview -
// exactly where it's needed to test an email flow before Resend is set up.
export function isRealProductionDeployment(): boolean {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}

// Logs to the server console instead of sending, whenever Resend isn't
// configured on a non-production deployment - keeps an email-driven flow
// testable locally and on a Vercel preview before a Resend domain is
// verified (see docs/STATUS.md). Production always sends for real (or fails
// closed) - never silently skips a real email. Same fallback shape as
// src/server/onboarding/service.ts's own sendConsentEmailOrLog (Phase 2a,
// kept separate/untouched rather than refactored onto this - a minors-
// safety-critical, already-shipped flow isn't worth the risk of a
// reuse-driven change for this checkpoint's sake).
export async function sendEmailOrLog(
  input: SendEmailInput & { devLogLabel: string; devLogDetail: string },
): Promise<void> {
  const emailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  if (!emailConfigured && !isRealProductionDeployment()) {
    console.log(`[dev] Email not configured - ${input.devLogLabel}: ${input.devLogDetail}`);
    return;
  }
  await sendEmail(input);
}
