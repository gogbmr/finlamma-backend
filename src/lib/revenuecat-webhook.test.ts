import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyRevenueCatWebhook } from "./revenuecat-webhook";

const HMAC_SECRET = "test-signing-secret";
const AUTH_HEADER_VALUE = "test-shared-secret";

function sign(body: string, timestamp: number, secret = HMAC_SECRET) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/revenuecat", { method: "POST", body, headers });
}

describe("verifyRevenueCatWebhook", () => {
  it("fails closed with SERVICE_UNAVAILABLE when neither secret is configured", async () => {
    await expect(
      verifyRevenueCatWebhook(makeRequest("{}"), { hmacSigningSecret: undefined, authHeaderValue: undefined }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("rejects a request with neither a signature nor an authorization header", async () => {
    await expect(
      verifyRevenueCatWebhook(makeRequest("{}"), {
        hmacSigningSecret: HMAC_SECRET,
        authHeaderValue: AUTH_HEADER_VALUE,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  describe("HMAC signature path (X-RevenueCat-Webhook-Signature)", () => {
    it("accepts a validly signed, fresh request and returns the parsed body", async () => {
      const payload = { event: { id: "evt-1", type: "RENEWAL" } };
      const body = JSON.stringify(payload);
      const header = sign(body, Math.floor(Date.now() / 1000));

      const result = await verifyRevenueCatWebhook(makeRequest(body, { "x-revenuecat-webhook-signature": header }), {
        hmacSigningSecret: HMAC_SECRET,
        authHeaderValue: undefined,
      });

      expect(result).toEqual(payload);
    });

    it("rejects a malformed signature header", async () => {
      await expect(
        verifyRevenueCatWebhook(makeRequest("{}", { "x-revenuecat-webhook-signature": "not-the-right-shape" }), {
          hmacSigningSecret: HMAC_SECRET,
          authHeaderValue: undefined,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });

    it("rejects a signature computed with the wrong secret", async () => {
      const body = JSON.stringify({ event: { id: "evt-1" } });
      const header = sign(body, Math.floor(Date.now() / 1000), "wrong-secret");

      await expect(
        verifyRevenueCatWebhook(makeRequest(body, { "x-revenuecat-webhook-signature": header }), {
          hmacSigningSecret: HMAC_SECRET,
          authHeaderValue: undefined,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });

    it("rejects a valid signature whose timestamp is outside the replay tolerance", async () => {
      const body = JSON.stringify({ event: { id: "evt-1" } });
      const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
      const header = sign(body, staleTimestamp);

      await expect(
        verifyRevenueCatWebhook(makeRequest(body, { "x-revenuecat-webhook-signature": header }), {
          hmacSigningSecret: HMAC_SECRET,
          authHeaderValue: undefined,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });

    it("rejects a body that was tampered with after signing", async () => {
      const originalBody = JSON.stringify({ event: { id: "evt-1" } });
      const header = sign(originalBody, Math.floor(Date.now() / 1000));
      const tamperedBody = JSON.stringify({ event: { id: "evt-2" } });

      await expect(
        verifyRevenueCatWebhook(makeRequest(tamperedBody, { "x-revenuecat-webhook-signature": header }), {
          hmacSigningSecret: HMAC_SECRET,
          authHeaderValue: undefined,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });

    it("rejects the signature header when only the auth-header secret is configured (dashboard mismatch)", async () => {
      const body = JSON.stringify({ event: { id: "evt-1" } });
      const header = sign(body, Math.floor(Date.now() / 1000));

      await expect(
        verifyRevenueCatWebhook(makeRequest(body, { "x-revenuecat-webhook-signature": header }), {
          hmacSigningSecret: undefined,
          authHeaderValue: AUTH_HEADER_VALUE,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });
  });

  describe("shared Authorization header path", () => {
    it("accepts a matching Authorization header and returns the parsed body", async () => {
      const payload = { event: { id: "evt-1", type: "RENEWAL" } };
      const body = JSON.stringify(payload);

      const result = await verifyRevenueCatWebhook(makeRequest(body, { authorization: AUTH_HEADER_VALUE }), {
        hmacSigningSecret: undefined,
        authHeaderValue: AUTH_HEADER_VALUE,
      });

      expect(result).toEqual(payload);
    });

    it("rejects a non-matching Authorization header", async () => {
      await expect(
        verifyRevenueCatWebhook(makeRequest("{}", { authorization: "wrong-value" }), {
          hmacSigningSecret: undefined,
          authHeaderValue: AUTH_HEADER_VALUE,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });

    it("rejects the auth header when only the HMAC secret is configured (dashboard mismatch)", async () => {
      await expect(
        verifyRevenueCatWebhook(makeRequest("{}", { authorization: AUTH_HEADER_VALUE }), {
          hmacSigningSecret: HMAC_SECRET,
          authHeaderValue: undefined,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    });
  });

  it("prefers the HMAC path when both a signature header and a matching auth secret are present", async () => {
    const payload = { event: { id: "evt-1" } };
    const body = JSON.stringify(payload);
    const header = sign(body, Math.floor(Date.now() / 1000));

    const result = await verifyRevenueCatWebhook(
      makeRequest(body, { "x-revenuecat-webhook-signature": header, authorization: "irrelevant" }),
      { hmacSigningSecret: HMAC_SECRET, authHeaderValue: AUTH_HEADER_VALUE },
    );

    expect(result).toEqual(payload);
  });
});
