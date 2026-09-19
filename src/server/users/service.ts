import type { WebhookEvent } from "@clerk/nextjs/server";
import { logActivity } from "@/lib/activity-log";
import { deleteConsumerClerkUser } from "@/lib/auth";
import type { requestMeta } from "@/lib/http";
import type { users } from "@/db/schema";
import type { UpdateMeInput } from "./schemas";
import { anonymizeUserFromClerk, updateUserPrefs, upsertUserFromClerk } from "./repo";

type UserRow = typeof users.$inferSelect;
type RequestMeta = ReturnType<typeof requestMeta>;

function toMeResponse(user: UserRow) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastInitial: user.lastInitial,
    email: user.email,
    phone: user.phone,
    language: user.language,
    theme: user.theme,
  };
}

export function getMe(user: UserRow) {
  return toMeResponse(user);
}

export async function updateMe(user: UserRow, input: UpdateMeInput, meta: RequestMeta) {
  const updated = await updateUserPrefs(user.id, input);

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "user.updated_prefs",
    targetType: "user",
    targetId: user.id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return toMeResponse(updated);
}

// Account deletion (docs/PRODUCT_SPEC.md Settings, non-negotiable rule 10):
// deletes the Clerk identity first (the harder-to-retry external call - if
// it fails, nothing in our DB has changed yet), then anonymizes our own row
// directly rather than waiting on the resulting user.deleted webhook, so
// the caller sees the effect immediately. anonymizeUserFromClerk is
// idempotent, so the webhook redelivery is a harmless no-op.
//
// Known gap (flagged by security review, not fixed here - needs a
// reconciliation job, which needs Inngest, not yet set up in this phase):
// if the Clerk delete above succeeds but the anonymize below throws, the
// user is stuck - requireUser() now fails (Clerk identity gone) before
// they can retry, and the only remaining path to consistency is the async
// user.deleted webhook eventually arriving. Revisit once Inngest exists.
export async function deleteMe(user: UserRow, meta: RequestMeta) {
  await deleteConsumerClerkUser(user.clerkUserId);
  await anonymizeUserFromClerk(user.clerkUserId);

  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "user.deleted_self",
    targetType: "user",
    targetId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

function primaryVerifiedEmail(
  data: Extract<WebhookEvent, { type: "user.created" | "user.updated" }>["data"],
): string | null {
  const primary = data.email_addresses?.find(
    (e) => e.id === data.primary_email_address_id,
  );
  return primary?.verification?.status === "verified"
    ? primary.email_address
    : null;
}

function primaryVerifiedPhone(
  data: Extract<WebhookEvent, { type: "user.created" | "user.updated" }>["data"],
): string | null {
  const primary = data.phone_numbers?.find(
    (p) => p.id === data.primary_phone_number_id,
  );
  return primary?.verification?.status === "verified"
    ? primary.phone_number
    : null;
}

// Handles a verified Clerk webhook event. The route only verifies the
// signature and hands the parsed event here - all sync logic lives in one
// place so it's testable without an HTTP request.
export async function syncUserFromClerkEvent(evt: WebhookEvent) {
  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { data } = evt;
    // Kid-safe: only ever store first name + last-initial, never the full
    // last name. Both are nullable - phone-only signups have no name yet
    // until onboarding collects one.
    await upsertUserFromClerk({
      clerkUserId: data.id,
      firstName: data.first_name || null,
      lastInitial: data.last_name ? data.last_name[0] : null,
      email: primaryVerifiedEmail(data),
      phone: primaryVerifiedPhone(data),
      clerkUpdatedAt: new Date(data.updated_at),
    });

    await logActivity({
      actorType: "system",
      action: "user.synced_from_clerk",
      targetType: "user",
      targetId: data.id,
      metadata: { clerkEventType: evt.type },
    });
    return;
  }

  if (evt.type === "user.deleted") {
    const clerkUserId = evt.data.id;
    if (!clerkUserId) return;

    await anonymizeUserFromClerk(clerkUserId);

    await logActivity({
      actorType: "system",
      action: "user.deleted_from_clerk",
      targetType: "user",
      targetId: clerkUserId,
    });
  }
}
