import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockGetLegalStatus = vi.fn();
vi.mock("@/server/legal/service", () => ({
  getLegalStatus: (user: unknown) => mockGetLegalStatus(user),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/legal-status");
}

describe("GET /api/v1/me/legal-status", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockGetLegalStatus.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetLegalStatus).not.toHaveBeenCalled();
  });

  it("returns the caller's legal status", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockGetLegalStatus.mockResolvedValueOnce({ documents: [], allAccepted: true });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetLegalStatus).toHaveBeenCalledWith(USER);
    const body = await res.json();
    expect(body.data.allAccepted).toBe(true);
  });
});
