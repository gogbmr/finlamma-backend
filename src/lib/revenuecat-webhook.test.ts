import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyRevenueCatWebhook } from "./revenuecat-webhook";

const SECRET = "test-signing-secret";

function sign(body: string, timestamp: number, secret = SECRET) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function makeRequest(body: string, signatureHeader?: string) {
  return new Request("http://localhost/api/webhooks/revenuecat", {
    method: "POST",
    body,
    headers: signatureHeader ? { "x-revenuecat-webhook-signature": signatureHeader } : {},
  });
}

describe("verifyRevenueCatWebhook", () => {
  it("fails closed with SERVICE_UNAVAILABLE when no signing secret is configured", async () => {
    await expect(verifyRevenueCatWebhook(makeRequest("{}"), undefined)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("rejects a request with no signature header", async () => {
    await expect(verifyRevenueCatWebhook(makeRequest("{}"), SECRET)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });

  it("rejects a malformed signature header", async () => {
    await expect(
      verifyRevenueCatWebhook(makeRequest("{}", "not-the-right-shape"), SECRET),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const body = JSON.stringify({ event: { id: "evt-1" } });
    const header = sign(body, Math.floor(Date.now() / 1000), "wrong-secret");

    await expect(verifyRevenueCatWebhook(makeRequest(body, header), SECRET)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });

  it("rejects a valid signature whose timestamp is outside the replay tolerance", async () => {
    const body = JSON.stringify({ event: { id: "evt-1" } });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const header = sign(body, staleTimestamp);

    await expect(verifyRevenueCatWebhook(makeRequest(body, header), SECRET)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });

  it("accepts a validly signed, fresh request and returns the parsed body", async () => {
    const payload = { event: { id: "evt-1", type: "RENEWAL" } };
    const body = JSON.stringify(payload);
    const header = sign(body, Math.floor(Date.now() / 1000));

    const result = await verifyRevenueCatWebhook(makeRequest(body, header), SECRET);

    expect(result).toEqual(payload);
  });

  it("rejects a body that was tampered with after signing", async () => {
    const originalBody = JSON.stringify({ event: { id: "evt-1" } });
    const header = sign(originalBody, Math.floor(Date.now() / 1000));
    const tamperedBody = JSON.stringify({ event: { id: "evt-2" } });

    await expect(verifyRevenueCatWebhook(makeRequest(tamperedBody, header), SECRET)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });
});
