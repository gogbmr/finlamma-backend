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

const mockGetPublicMentors = vi.fn();
vi.mock("@/server/mentors/service", () => ({
  getPublicMentors: () => mockGetPublicMentors(),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/mentors");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/mentors", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetPublicMentors).not.toHaveBeenCalled();
  });

  it("returns 403 when onboarding/consent/legal isn't complete (requireFullAccess)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Complete onboarding before using this feature"),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetPublicMentors).not.toHaveBeenCalled();
  });

  it("returns the published mentor list", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicMentors.mockResolvedValueOnce([{ key: "baby", order: 1 }]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockRequireFullAccess).toHaveBeenCalledWith(USER);
    const body = await res.json();
    expect(body.data).toEqual([{ key: "baby", order: 1 }]);
  });
});
