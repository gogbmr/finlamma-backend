import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetMySelectedChips = vi.fn();
const mockSetMySelectedChips = vi.fn();
vi.mock("@/server/arena/service", () => ({
  getMySelectedChips: (userId: unknown) => mockGetMySelectedChips(userId),
  setMySelectedChips: (user: unknown, chipIds: unknown, meta: unknown) =>
    mockSetMySelectedChips(user, chipIds, meta),
}));

import { GET, PUT } from "./route";

const USER = { id: "u1" };
const CHIP_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeGetRequest() {
  return new Request("http://localhost/api/v1/me/arena/chips");
}

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/arena/chips", { method: "PUT", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/arena/chips", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
  });

  it("returns the caller's selected chips", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMySelectedChips.mockResolvedValueOnce([{ id: CHIP_ID, name: { en: "Saver" }, iconKey: null }]);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(mockGetMySelectedChips).toHaveBeenCalledWith("u1");
  });
});

describe("PUT /api/v1/me/arena/chips", () => {
  it("returns 400 for more than 3 chip ids", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await PUT(makePutRequest({ chipIds: [CHIP_ID, CHIP_ID, CHIP_ID, CHIP_ID] }));

    expect(res.status).toBe(400);
    expect(mockSetMySelectedChips).not.toHaveBeenCalled();
  });

  it("sets the selection and returns the new list", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockSetMySelectedChips.mockResolvedValueOnce(undefined);
    mockGetMySelectedChips.mockResolvedValueOnce([{ id: CHIP_ID, name: { en: "Saver" }, iconKey: null }]);

    const res = await PUT(makePutRequest({ chipIds: [CHIP_ID] }));

    expect(res.status).toBe(200);
    expect(mockSetMySelectedChips).toHaveBeenCalledWith(USER, [CHIP_ID], expect.any(Object));
  });
});
