import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCaptureEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ captureEvent: (...args: unknown[]) => mockCaptureEvent(...args) }));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  HOMEPAGE_TRACK_RATE_LIMIT: { requests: 20, window: "60 s", prefix: "ratelimit:homepage-track" },
}));

import { POST } from "./route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
});

describe("POST /api/track", () => {
  it("accepts homepage_viewed and forwards a fresh anonymous id, no event properties", async () => {
    const res = await POST(makeRequest({ event: "homepage_viewed" }));

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    const [distinctId, event, properties] = mockCaptureEvent.mock.calls[0];
    expect(event).toBe("homepage_viewed");
    expect(properties).toBeUndefined();
    expect(typeof distinctId).toBe("string");
    expect(distinctId.length).toBeGreaterThan(10);
  });

  it("accepts app_store_link_clicked with a platform property", async () => {
    const res = await POST(makeRequest({ event: "app_store_link_clicked", platform: "android" }));

    expect(res.status).toBe(200);
    expect(mockCaptureEvent).toHaveBeenCalledWith(expect.any(String), "app_store_link_clicked", {
      platform: "android",
    });
  });

  it("rejects an event name outside the fixed enum", async () => {
    const res = await POST(makeRequest({ event: "lesson_completed" }));

    expect(res.status).toBe(400);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("uses a different anonymous id per call - never a stable/identifying one", async () => {
    await POST(makeRequest({ event: "homepage_viewed" }));
    await POST(makeRequest({ event: "homepage_viewed" }));

    const [firstId] = mockCaptureEvent.mock.calls[0];
    const [secondId] = mockCaptureEvent.mock.calls[1];
    expect(firstId).not.toBe(secondId);
  });

  it("rejects an unknown field instead of silently stripping it", async () => {
    const res = await POST(makeRequest({ event: "homepage_viewed", injected: "<script>evil</script>" }));

    expect(res.status).toBe(400);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("rejects a platform value outside the fixed enum", async () => {
    const res = await POST(makeRequest({ event: "app_store_link_clicked", platform: "windows-phone" }));

    expect(res.status).toBe(400);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("is rate-limited per IP, failing before the body is even parsed", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: true });

    const res = await POST(makeRequest({ event: "homepage_viewed" }, { "x-forwarded-for": "1.2.3.4" }));

    expect(res.status).toBe(429);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1.2.3.4", expect.anything(), true);
  });

  it("never blocks on an unconfigured/unreachable rate limiter (fails open)", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true, configured: false });

    const res = await POST(makeRequest({ event: "homepage_viewed" }));

    expect(res.status).toBe(200);
  });

  it("rejects platform sent alongside an event other than app_store_link_clicked", async () => {
    const res = await POST(makeRequest({ event: "homepage_viewed", platform: "android" }));

    expect(res.status).toBe(400);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });
});
