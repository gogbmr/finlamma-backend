import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireRelaySecret = vi.fn();
vi.mock("@/lib/relay-auth", () => ({
  requireRelaySecret: (req: unknown) => mockRequireRelaySecret(req),
}));

const mockGetRelayConfig = vi.fn();
vi.mock("@/server/relay/service", () => ({
  getRelayConfig: () => mockGetRelayConfig(),
}));

import { GET } from "./route";

function makeRequest(secret: string | null) {
  const headers = new Headers();
  if (secret !== null) headers.set("X-Relay-Secret", secret);
  return new Request("http://localhost/api/v1/relay/config", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/relay/config", () => {
  it("returns 401 with no detail when the secret is wrong", async () => {
    mockRequireRelaySecret.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Unauthorized"));

    const res = await GET(makeRequest("wrong"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toEqual({ code: "UNAUTHENTICATED", message: "Unauthorized" });
    expect(mockGetRelayConfig).not.toHaveBeenCalled();
  });

  it("returns 401 when the header is missing", async () => {
    mockRequireRelaySecret.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Unauthorized"));

    const res = await GET(makeRequest(null));

    expect(res.status).toBe(401);
  });

  it("returns 503 when relay auth isn't configured", async () => {
    mockRequireRelaySecret.mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE", "Relay authentication is not configured"),
    );

    const res = await GET(makeRequest("anything"));

    expect(res.status).toBe(503);
  });

  it("returns 429 when rate limited", async () => {
    mockRequireRelaySecret.mockRejectedValueOnce(new AppError("RATE_LIMITED", "Too many requests"));

    const res = await GET(makeRequest("anything"));

    expect(res.status).toBe(429);
  });

  it("returns the relay config with a valid secret, and the response body carries no secrets", async () => {
    mockRequireRelaySecret.mockResolvedValueOnce(undefined);
    mockGetRelayConfig.mockResolvedValueOnce({
      instruments: [{ symbol: "RELIANCE", exchange: "NSE", halted: false }],
      feedMode: "live",
      globalHalt: false,
      holidays: ["2026-10-02"],
    });

    const res = await GET(makeRequest("correct-secret-value"));

    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("correct-secret-value");
    expect(bodyText).not.toContain("RELAY_SHARED_SECRET");
    const body = JSON.parse(bodyText);
    expect(body.data.instruments).toEqual([{ symbol: "RELIANCE", exchange: "NSE", halted: false }]);
    expect(body.data.feedMode).toBe("live");
  });
});
