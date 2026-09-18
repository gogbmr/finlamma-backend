import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: this object is referenced directly (not behind a closure) in
// the vi.mock factory below, which vitest hoists above this declaration -
// without vi.hoisted, mockEnv would be read before it's initialized.
const mockEnv = vi.hoisted(
  () => ({ CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test" as string | undefined }),
);
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockVerify = vi.fn();
vi.mock("svix", () => ({
  // route.ts does `new Webhook(secret)`, so the mock must be a real
  // constructor - an arrow function implementation can't be `new`-ed.
  Webhook: vi.fn(function MockWebhook() {
    return { verify: mockVerify };
  }),
}));

const mockSync = vi.fn();
vi.mock("@/server/users/service", () => ({
  syncUserFromClerkEvent: (evt: unknown) => mockSync(evt),
}));

import { POST } from "./route";

function makeRequest(body: string, headers?: Record<string, string>) {
  return new Request("http://localhost/api/webhooks/clerk", {
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

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    mockEnv.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_test";
    mockVerify.mockReset();
    mockSync.mockReset();
  });

  it("fails closed with 503 when no signing secret is configured", async () => {
    mockEnv.CLERK_WEBHOOK_SIGNING_SECRET = undefined;

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(503);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("returns 400 when svix headers are missing", async () => {
    const req = new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: "{}",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("returns 400 with INVALID_SIGNATURE when svix rejects the signature", async () => {
    mockVerify.mockImplementationOnce(() => {
      throw new Error("signature mismatch");
    });

    const res = await POST(makeRequest(JSON.stringify({ type: "user.created" })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_SIGNATURE");
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("processes a verified event and returns 200", async () => {
    const evt = { type: "user.created", data: { id: "user_1" } };
    mockVerify.mockReturnValueOnce(evt);
    mockSync.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith(evt);
    const body = await res.json();
    expect(body.data.received).toBe(true);
  });
});
