import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockRegisterPushToken = vi.fn();
const mockUnregisterPushToken = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
  unregisterPushToken: (...args: unknown[]) => mockUnregisterPushToken(...args),
}));

import { DELETE, POST } from "./route";

const USER = { id: "u1" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/push-token", { method: "POST", body: JSON.stringify(body) });
}
function deleteRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/push-token", { method: "DELETE", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("POST /api/v1/me/push-token", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(postRequest({ expoPushToken: "ExponentPushToken[x]", platform: "ios" }));

    expect(res.status).toBe(401);
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid body", async () => {
    const res = await POST(postRequest({ expoPushToken: "", platform: "ios" }));

    expect(res.status).toBe(400);
  });

  it("registers and returns 200", async () => {
    const res = await POST(postRequest({ expoPushToken: "ExponentPushToken[x]", platform: "android" }));

    expect(res.status).toBe(200);
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      { id: "u1" },
      { expoPushToken: "ExponentPushToken[x]", platform: "android" },
      expect.anything(),
    );
  });
});

describe("DELETE /api/v1/me/push-token", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await DELETE(deleteRequest({ expoPushToken: "ExponentPushToken[x]" }));

    expect(res.status).toBe(401);
  });

  it("unregisters and returns 200", async () => {
    const res = await DELETE(deleteRequest({ expoPushToken: "ExponentPushToken[x]" }));

    expect(res.status).toBe(200);
    expect(mockUnregisterPushToken).toHaveBeenCalledWith({ id: "u1" }, "ExponentPushToken[x]", expect.anything());
  });
});
