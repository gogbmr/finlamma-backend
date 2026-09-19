// Regression test for the "Cannot read properties of undefined (reading
// 'type')" production bug: svix@2.5.0's Webhook.verify() only validates the
// signature and never returns the parsed payload (confirmed by reading its
// compiled source - it discards the inner verifier's result and always
// forces jsonParse: false). The original route.test.ts mocked `svix`
// entirely, with the mock's `verify()` simply returning whatever event we
// told it to - which is exactly why this never got caught. This file
// deliberately does NOT mock svix, so it exercises the real library the
// same way a real Clerk delivery does.
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(
  () => ({ CLERK_WEBHOOK_SIGNING_SECRET: "whsec_dGVzdF9zZWNyZXRfdmFsdWU=" }),
);
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockSync = vi.fn();
vi.mock("@/server/users/service", () => ({
  syncUserFromClerkEvent: (evt: unknown) => mockSync(evt),
}));

import { POST } from "./route";

function signedRequest(payload: object) {
  const body = JSON.stringify(payload);
  const msgId = `msg_${randomBytes(8).toString("hex")}`;
  const timestamp = new Date();
  const wh = new Webhook(mockEnv.CLERK_WEBHOOK_SIGNING_SECRET);
  const signature = wh.sign(msgId, timestamp, body);

  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body,
    headers: {
      "svix-id": msgId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
  });
}

describe("POST /api/webhooks/clerk (real svix, no mock)", () => {
  beforeEach(() => {
    mockSync.mockReset();
  });

  it("parses a genuinely-signed event and hands the real payload to syncUserFromClerkEvent", async () => {
    const evt = { type: "user.created", data: { id: "user_real_svix_test" } };

    const res = await POST(signedRequest(evt));

    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith(evt);
  });

  it("handles Clerk's own edge-case example shape (primary_email_address_id set, email_addresses empty)", async () => {
    const evt = {
      type: "user.created",
      object: "event",
      data: {
        id: "user_edge_case",
        email_addresses: [],
        primary_email_address_id: "idn_does_not_exist",
        phone_numbers: [],
        primary_phone_number_id: null,
        first_name: "Example",
        last_name: "Example",
        updated_at: 1654012591835,
      },
    };

    const res = await POST(signedRequest(evt));

    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith(evt);
  });

  it("rejects a payload whose signature doesn't match (real crypto, not a mocked throw)", async () => {
    const body = JSON.stringify({ type: "user.created", data: { id: "user_1" } });
    const req = new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body,
      headers: {
        "svix-id": "msg_tampered",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,not-a-real-signature",
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_SIGNATURE");
    expect(mockSync).not.toHaveBeenCalled();
  });
});
