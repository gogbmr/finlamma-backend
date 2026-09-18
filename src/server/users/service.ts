import type { WebhookEvent } from "@clerk/nextjs/server";
import { logActivity } from "@/lib/activity-log";
import { anonymizeUserFromClerk, upsertUserFromClerk } from "./repo";

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
