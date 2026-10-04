import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetMyNotificationPrefs = vi.fn();
const mockUpdateMyNotificationPrefs = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  getMyNotificationPrefs: (...args: unknown[]) => mockGetMyNotificationPrefs(...args),
  updateMyNotificationPrefs: (...args: unknown[]) => mockUpdateMyNotificationPrefs(...args),
}));

import { GET, PATCH } from "./route";

const USER = { id: "u1" };
const PREFS = { enabled: true, quietHours: { startHourIst: 21, endHourIst: 7 }, disabledCategories: [] };

function getRequest() {
  return new Request("http://localhost/api/v1/me/notification-prefs");
}
function patchRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/notification-prefs", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
  mockGetMyNotificationPrefs.mockResolvedValue(PREFS);
  mockUpdateMyNotificationPrefs.mockResolvedValue(PREFS);
});

describe("GET /api/v1/me/notification-prefs", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });

  it("returns the resolved prefs", async () => {
    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(PREFS);
  });
});

describe("PATCH /api/v1/me/notification-prefs", () => {
  it("returns 400 on an invalid quietHours value", async () => {
    const res = await PATCH(patchRequest({ quietHours: { startHourIst: 30, endHourIst: 7 } }));

    expect(res.status).toBe(400);
    expect(mockUpdateMyNotificationPrefs).not.toHaveBeenCalled();
  });

  it("updates and returns 200", async () => {
    const res = await PATCH(patchRequest({ enabled: false }));

    expect(res.status).toBe(200);
    expect(mockUpdateMyNotificationPrefs).toHaveBeenCalledWith({ id: "u1" }, { enabled: false }, expect.anything());
  });
});
