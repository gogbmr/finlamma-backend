import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockEnv = vi.hoisted(() => ({
  REVENUECAT_WEBHOOK_SECRET: "secret" as string | undefined,
  REVENUECAT_WEBHOOK_AUTH_HEADER: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockVerify = vi.fn();
vi.mock("@/lib/revenuecat-webhook", () => ({ verifyRevenueCatWebhook: (...args: unknown[]) => mockVerify(...args) }));

const mockProcess = vi.fn();
vi.mock("@/server/monetisation/service", () => ({
  processRevenueCatWebhookEvent: (payload: unknown) => mockProcess(payload),
}));

import { POST } from "./route";

function makeRequest(body: string) {
  return new Request("http://localhost/api/webhooks/revenuecat", {
    method: "POST",
    body,
    headers: { "x-revenuecat-webhook-signature": "t=1,v1=abc" },
  });
}

describe("POST /api/webhooks/revenuecat", () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockProcess.mockReset();
  });

  it("surfaces the verifier's failure (e.g. 503 when unconfigured) without processing anything", async () => {
    mockVerify.mockImplementationOnce(() => {
      throw new AppError("SERVICE_UNAVAILABLE", "not configured");
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(503);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("processes a verified event and always returns 200, even for an event the service ignores", async () => {
    const evt = { event: { id: "evt-1", type: "RENEWAL" } };
    mockVerify.mockResolvedValueOnce(evt);
    mockProcess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(JSON.stringify(evt)));

    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith(expect.anything(), {
      hmacSigningSecret: "secret",
      authHeaderValue: undefined,
    });
    expect(mockProcess).toHaveBeenCalledWith(evt);
    const body = await res.json();
    expect(body.data.received).toBe(true);
  });
});
