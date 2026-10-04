import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  POSTHOG_API_KEY: undefined as string | undefined,
  POSTHOG_HOST: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockCapture = vi.hoisted(() => vi.fn());
const mockFlush = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(function MockPostHog() {
    return { capture: mockCapture, flush: mockFlush };
  }),
}));

const mockAfter = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: mockAfter }));

const { captureEvent } = await import("./analytics");

beforeEach(() => {
  mockEnv.POSTHOG_API_KEY = undefined;
  mockEnv.POSTHOG_HOST = undefined;
  mockCapture.mockClear();
  mockFlush.mockClear();
  mockAfter.mockClear();
});

describe("captureEvent", () => {
  it("is a silent no-op when POSTHOG_API_KEY is unset - never schedules anything", () => {
    expect(() => captureEvent("user-1", "session_started")).not.toThrow();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("schedules the capture via after() once configured, never blocking the caller", () => {
    mockEnv.POSTHOG_API_KEY = "phc_test";
    captureEvent("user-1", "lesson_completed", { lessonKind: "quiz" });
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("the scheduled callback forwards distinctId/event/properties and flushes", async () => {
    mockEnv.POSTHOG_API_KEY = "phc_test";
    captureEvent("user-1", "world_completed", { worldOrder: 2 });

    const scheduled = mockAfter.mock.calls[0]?.[0] as () => Promise<void>;
    await scheduled();

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "world_completed",
      properties: { worldOrder: 2 },
    });
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it("never throws even if the scheduled capture/flush itself fails", async () => {
    mockEnv.POSTHOG_API_KEY = "phc_test";
    mockFlush.mockRejectedValueOnce(new Error("network down"));
    captureEvent("user-1", "streak_broken");

    const scheduled = mockAfter.mock.calls[0]?.[0] as () => Promise<void>;
    await expect(scheduled()).resolves.toBeUndefined();
  });

  it("falls back to a plain fire-and-forget when after() throws (no request context)", () => {
    mockEnv.POSTHOG_API_KEY = "phc_test";
    mockAfter.mockImplementationOnce(() => {
      throw new Error("after() called outside request scope");
    });

    expect(() => captureEvent("user-1", "entitlement_purchased")).not.toThrow();
  });
});
