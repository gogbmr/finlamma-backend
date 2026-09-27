import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockCreateSip = vi.fn();
const mockListMySips = vi.fn();
vi.mock("@/server/fund-orders/sip-service", () => ({
  createSip: (...args: unknown[]) => mockCreateSip(...args),
  listMySips: (...args: unknown[]) => mockListMySips(...args),
}));

import { GET, POST } from "./route";

const USER = { id: "u1" };
const VALID_BODY = { fundId: "00000000-0000-0000-0000-000000000000", amountPaise: 10000, dayOfMonth: 5 };

function makeGetRequest() {
  return new Request("http://localhost/api/v1/trade/funds/sip");
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/v1/trade/funds/sip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/funds/sip", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns the caller's SIP plans", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMySips.mockResolvedValueOnce([{ id: "plan_1", status: "active" }]);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(mockListMySips).toHaveBeenCalledWith(USER.id);
  });
});

describe("POST /api/v1/trade/funds/sip", () => {
  it("returns 400 for an invalid dayOfMonth (29+)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makePostRequest({ ...VALID_BODY, dayOfMonth: 29 }));

    expect(res.status).toBe(400);
    expect(mockCreateSip).not.toHaveBeenCalled();
  });

  it("returns 403 when trading isn't unlocked", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockCreateSip.mockRejectedValueOnce(new AppError("FORBIDDEN", "Trading is locked until you clear more worlds"));

    const res = await POST(makePostRequest(VALID_BODY));

    expect(res.status).toBe(403);
  });

  it("creates the plan", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockCreateSip.mockResolvedValueOnce({ id: "plan_1", status: "active", nextDueDate: "2026-10-05" });

    const res = await POST(makePostRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("plan_1");
  });
});
