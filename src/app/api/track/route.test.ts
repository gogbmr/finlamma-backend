import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCaptureEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ captureEvent: (...args: unknown[]) => mockCaptureEvent(...args) }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
