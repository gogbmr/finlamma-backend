import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetMyCheersSummary = vi.fn();
vi.mock("@/server/arena/service", () => ({
  getMyCheersSummary: (user: unknown) => mockGetMyCheersSummary(user),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/arena/cheers");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/arena/cheers", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("returns only an aggregate count", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyCheersSummary.mockResolvedValueOnce({ receivedThisWeek: 12 });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ receivedThisWeek: 12 });
    expect(mockGetMyCheersSummary).toHaveBeenCalledWith(USER);
  });
});
