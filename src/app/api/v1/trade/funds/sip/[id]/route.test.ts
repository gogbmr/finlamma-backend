import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockUpdateSipPlanStatus = vi.fn();
vi.mock("@/server/fund-orders/sip-service", () => ({
  updateSipPlanStatus: (...args: unknown[]) => mockUpdateSipPlanStatus(...args),
}));

import { PATCH } from "./route";

const USER = { id: "u1" };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/trade/funds/sip/plan_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/trade/funds/sip/{id}", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await PATCH(makeRequest({ action: "pause" }), { params: Promise.resolve({ id: "plan_1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid action", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await PATCH(makeRequest({ action: "delete" }), { params: Promise.resolve({ id: "plan_1" }) });

    expect(res.status).toBe(400);
    expect(mockUpdateSipPlanStatus).not.toHaveBeenCalled();
  });

  it("returns 404 for a plan the caller doesn't own", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockUpdateSipPlanStatus.mockRejectedValueOnce(new AppError("NOT_FOUND", "No SIP plan with this id"));

    const res = await PATCH(makeRequest({ action: "pause" }), { params: Promise.resolve({ id: "plan_1" }) });

    expect(res.status).toBe(404);
  });

  it("returns 409 when the action doesn't apply to the plan's current status", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockUpdateSipPlanStatus.mockRejectedValueOnce(new AppError("CONFLICT", "Cannot pause a SIP plan that is currently \"cancelled\""));

    const res = await PATCH(makeRequest({ action: "pause" }), { params: Promise.resolve({ id: "plan_1" }) });

    expect(res.status).toBe(409);
  });

  it("pauses the plan and passes the action through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockUpdateSipPlanStatus.mockResolvedValueOnce({ id: "plan_1", status: "paused" });

    const res = await PATCH(makeRequest({ action: "pause" }), { params: Promise.resolve({ id: "plan_1" }) });

    expect(res.status).toBe(200);
    expect(mockUpdateSipPlanStatus).toHaveBeenCalledWith(USER, "plan_1", "pause", expect.any(Object));
  });
});
