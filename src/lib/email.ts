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
