import { z } from "zod";
import { verifyClerkWebhook } from "@/lib/clerk-webhook";
import { env } from "@/lib/env";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import {
  completeStaffInviteFromClerkEvent,
  deactivateStaffMemberFromClerkEvent,
} from "@/server/staff/service";

const WebhookResponseSchema = registry.register(
  "ClerkStaffWebhookResponse",
  z.object({ data: z.object({ received: z.literal(true) }) }),
);

registry.registerPath({
  method: "post",
  path: "/api/webhooks/clerk-staff",
  summary: "Clerk user webhook (staff app)",
  description:
    "Called by Clerk on user.created and user.deleted for the STAFF Clerk application (see " +
    "docs/ARCHITECTURE.md decision D2a) - the consumer app's webhook at /api/webhooks/clerk is " +
    "separate. On user.created, completes a pending staff invite (see " +
    "src/server/staff/service.ts inviteStaffMember()): if the new user's public metadata " +
    "carries the role id the invitation was created with, a staff_members row is created for " +
    "them. On user.deleted, deactivates their staff_members row if they had one, so deleting a " +
    "staff Clerk identity directly in the Clerk dashboard also revokes admin access here. " +
    "Authenticated by an HMAC signature in the svix-id / svix-timestamp / svix-signature " +
    "headers, verified against STAFF_CLERK_WEBHOOK_SIGNING_SECRET - configured as a webhook " +
    "endpoint in the Clerk dashboard, not by a user or staff session.",
  tags: ["Webhooks"],
  request: {
    headers: z.object({
      "svix-id": z.string().openapi({ description: "Unique id of this webhook delivery" }),
      "svix-timestamp": z.string().openapi({ description: "Unix timestamp the webhook was sent" }),
      "svix-signature": z.string().openapi({ description: "HMAC signature(s) of the request body" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            type: z.string().openapi({ example: "user.created" }),
            data: z.record(z.string(), z.unknown()),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Event processed (or a type we don't act on)",
      content: { "application/json": { schema: WebhookResponseSchema } },
    },
    400: {
      description: "Missing/invalid svix signature",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    503: {
      description: "Webhook signing secret not configured",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const evt = await verifyClerkWebhook(req, env.STAFF_CLERK_WEBHOOK_SIGNING_SECRET);

  if (evt.type === "user.created") {
    const publicMetadata = (evt.data.public_metadata ?? {}) as Record<string, unknown>;
    await completeStaffInviteFromClerkEvent(evt.data.id, publicMetadata);
  } else if (evt.type === "user.deleted" && evt.data.id) {
    await deactivateStaffMemberFromClerkEvent(evt.data.id);
  }

  return ok({ received: true as const });
});
