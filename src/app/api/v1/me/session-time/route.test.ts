import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockRecordSessionTime = vi.fn();
vi.mock("@/server/session-time/service", () => ({
  recordSessionTime: (user: unknown, seconds: unknown, meta: unknown) =>
    mockRecordSessionTime(user, seconds, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest(body?: unknown) {
  return new Request("http://localhost/api/v1/me/session-time", {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/me/session-time", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({ seconds: 240 }));

    expect(res.status).toBe(401);
    expect(mockRecordSessionTime).not.toHaveBeenCalled();
  });

  it("returns 400 when seconds is missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(mockRecordSessionTime).not.toHaveBeenCalled();
  });

  it("returns 400 when seconds exceeds the 1-hour cap", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({ seconds: 3601 }));

    expect(res.status).toBe(400);
    expect(mockRecordSessionTime).not.toHaveBeenCalled();
  });

  it("records the session time and returns today's running total", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockRecordSessionTime.mockResolvedValueOnce({ todaySeconds: 480 });

    const res = await POST(makeRequest({ seconds: 240 }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.todaySeconds).toBe(480);
    expect(mockRecordSessionTime).toHaveBeenCalledWith(USER, 240, { ip: null, userAgent: null });
  });
});
