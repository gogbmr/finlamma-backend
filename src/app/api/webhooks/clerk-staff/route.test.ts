import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(
  () => ({ STAFF_CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test" as string | undefined }),
);
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { mockVerify, mockWebhookCtor } = vi.hoisted(() => {
  const mockVerify = vi.fn();
  return {
    mockVerify,
    mockWebhookCtor: vi.fn(function MockWebhook() {
      return { verify: mockVerify };
    }),
  };
});
vi.mock("svix", () => ({ Webhook: mockWebhookCtor }));

const mockCompleteInvite = vi.fn();
const mockDeactivate = vi.fn();
vi.mock("@/server/staff/service", () => ({
  completeStaffInviteFromClerkEvent: (id: unknown, meta: unknown) =>
    mockCompleteInvite(id, meta),
  deactivateStaffMemberFromClerkEvent: (id: unknown) => mockDeactivate(id),
}));

import { POST } from "./route";

function makeRequest(body: string, headers?: Record<string, string>) {
  return new Request("http://localhost/api/webhooks/clerk-staff", {
    method: "POST",
    body,
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,abcdef",
      ...headers,
    },
  });
}

describe("POST /api/webhooks/clerk-staff", () => {
  beforeEach(() => {
    mockEnv.STAFF_CLERK_WEBHOOK_SIGNING_SECRET = "whsec_test";
    mockVerify.mockReset();
    mockCompleteInvite.mockReset();
    mockDeactivate.mockReset();
    mockWebhookCtor.mockClear();
  });

  it("fails closed with 503 when no signing secret is configured", async () => {
    mockEnv.STAFF_CLERK_WEBHOOK_SIGNING_SECRET = undefined;

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(503);
    expect(mockCompleteInvite).not.toHaveBeenCalled();
  });

  it("returns 400 with INVALID_SIGNATURE when svix rejects the signature", async () => {
    mockVerify.mockImplementationOnce(() => {
      throw new Error("signature mismatch");
    });

    const res = await POST(makeRequest(JSON.stringify({ type: "user.created" })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_SIGNATURE");
  });

  it("on user.created, completes the invite with the user's public metadata", async () => {
    const evt = {
      type: "user.created",
      data: { id: "staff_clerk_1", public_metadata: { finlammaStaffRoleId: "role-1" } },
    };
    mockCompleteInvite.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(mockCompleteInvite).toHaveBeenCalledWith("staff_clerk_1", {
      finlammaStaffRoleId: "role-1",
    });
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it("on user.created with no public metadata, still calls through with an empty object", async () => {
    const evt = { type: "user.created", data: { id: "staff_clerk_2" } };
    mockCompleteInvite.mockResolvedValueOnce(undefined);

    await POST(makeRequest(JSON.stringify(evt)));

    expect(mockCompleteInvite).toHaveBeenCalledWith("staff_clerk_2", {});
  });

  it("on user.deleted, deactivates the staff member", async () => {
    const evt = { type: "user.deleted", data: { id: "staff_clerk_1", deleted: true } };
    mockDeactivate.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(mockDeactivate).toHaveBeenCalledWith("staff_clerk_1");
    expect(mockCompleteInvite).not.toHaveBeenCalled();
  });

  it("ignores event types it doesn't act on", async () => {
    const evt = { type: "session.created", data: {} };

    const res = await POST(makeRequest(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(mockCompleteInvite).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });
});
