import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAddSessionSeconds = vi.fn();
const mockGetSessionSecondsForDate = vi.fn();
vi.mock("./repo", () => ({
  addSessionSeconds: (userId: unknown, dateIst: unknown, seconds: unknown) =>
    mockAddSessionSeconds(userId, dateIst, seconds),
  getSessionSecondsForDate: (userId: unknown, dateIst: unknown) =>
    mockGetSessionSecondsForDate(userId, dateIst),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import { getTodaySessionSeconds, recordSessionTime } from "./service";

const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const AT = new Date("2026-09-24T10:00:00.000Z"); // 2026-09-24 15:30 IST

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordSessionTime", () => {
  it("adds the reported seconds to today's (IST) running total", async () => {
    mockAddSessionSeconds.mockResolvedValueOnce({ seconds: 1140 });

    const result = await recordSessionTime(USER, 240, META, AT);

    expect(mockAddSessionSeconds).toHaveBeenCalledWith(USER.id, "2026-09-24", 240);
    expect(result).toEqual({ todaySeconds: 1140 });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "session_time.recorded", actorId: USER.id }),
    );
  });

  it("rejects zero or negative seconds", async () => {
    await expect(recordSessionTime(USER, 0, META, AT)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(recordSessionTime(USER, -5, META, AT)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockAddSessionSeconds).not.toHaveBeenCalled();
  });

  it("rejects more than 1 hour in a single ping", async () => {
    await expect(recordSessionTime(USER, 3601, META, AT)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockAddSessionSeconds).not.toHaveBeenCalled();
  });

  it("accepts exactly 1 hour", async () => {
    mockAddSessionSeconds.mockResolvedValueOnce({ seconds: 3600 });

    await expect(recordSessionTime(USER, 3600, META, AT)).resolves.toEqual({ todaySeconds: 3600 });
  });

  it("rejects a non-integer value", async () => {
    await expect(recordSessionTime(USER, 12.5, META, AT)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("getTodaySessionSeconds", () => {
  it("reads today's (IST) total", async () => {
    mockGetSessionSecondsForDate.mockResolvedValueOnce(600);

    const result = await getTodaySessionSeconds(USER.id, AT);

    expect(mockGetSessionSecondsForDate).toHaveBeenCalledWith(USER.id, "2026-09-24");
    expect(result).toBe(600);
  });
});
