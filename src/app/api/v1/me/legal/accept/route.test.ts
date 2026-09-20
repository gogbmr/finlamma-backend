import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockAcceptLegal = vi.fn();
vi.mock("@/server/legal/service", () => ({
  acceptLegal: (user: unknown, meta: unknown) => mockAcceptLegal(user, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/legal/accept", { method: "POST" });
}

describe("POST /api/v1/me/legal/accept", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockAcceptLegal.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockAcceptLegal).not.toHaveBeenCalled();
  });

  it("records acceptance and returns the accepted types", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockAcceptLegal.mockResolvedValueOnce({ accepted: ["terms", "privacy"] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockAcceptLegal).toHaveBeenCalledWith(USER, { ip: null, userAgent: null });
    const body = await res.json();
    expect(body.data.accepted).toEqual(["terms", "privacy"]);
  });
});
