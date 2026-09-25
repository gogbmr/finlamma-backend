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

const mockGetMyReportCard = vi.fn();
vi.mock("@/server/report-card/service", () => ({
  getMyReportCard: (user: unknown) => mockGetMyReportCard(user),
}));

import { GET } from "./route";

const USER = { id: "u1", dateOfBirth: "2015-01-01" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/report-card");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/report-card", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyReportCard).not.toHaveBeenCalled();
  });

  it("returns 403 when onboarding/consent/legal isn't complete", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Parental consent is required before using this feature"),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetMyReportCard).not.toHaveBeenCalled();
  });

  it("returns the caller's report card", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyReportCard.mockResolvedValueOnce({
      current: null,
      trend: [],
      sharedWithParent: { maskedEmail: "p***@example.com" },
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.current).toBeNull();
    expect(body.data.sharedWithParent).toEqual({ maskedEmail: "p***@example.com" });
    expect(mockGetMyReportCard).toHaveBeenCalledWith(USER);
  });
});
