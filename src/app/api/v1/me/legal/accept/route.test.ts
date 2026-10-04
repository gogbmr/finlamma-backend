import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

// This route's own captureEvent call (docs/ARCHITECTURE.md D69) would
// otherwise pull in the real @/lib/analytics -> @/lib/env unmocked here.
const mockCaptureEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ captureEvent: (...args: unknown[]) => mockCaptureEvent(...args) }));

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockAcceptLegal = vi.fn();
vi.mock("@/server/legal/service", () => ({
  acceptLegal: (user: unknown, meta: unknown) => mockAcceptLegal(user, meta),
}));

const mockHasFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  hasFullAccess: (user: unknown) => mockHasFullAccess(user),
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
    mockHasFullAccess.mockReset();
    mockCaptureEvent.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockAcceptLegal).not.toHaveBeenCalled();
  });

  it("records acceptance and returns the accepted types", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockHasFullAccess.mockResolvedValue(true); // already had full access before and after
    mockAcceptLegal.mockResolvedValueOnce({ accepted: ["terms", "privacy"] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockAcceptLegal).toHaveBeenCalledWith(USER, { ip: null, userAgent: null });
    const body = await res.json();
    expect(body.data.accepted).toEqual(["terms", "privacy"]);
  });

  it("fires signup_completed on the actual limited->full transition", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockHasFullAccess.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockAcceptLegal.mockResolvedValueOnce({ accepted: ["terms", "privacy", "risk_disclosure"] });

    await POST(makeRequest());

    expect(mockCaptureEvent).toHaveBeenCalledWith("u1", "signup_completed");
  });

  it("never fires signup_completed for a routine re-accept by an already-active user", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockHasFullAccess.mockResolvedValue(true);
    mockAcceptLegal.mockResolvedValueOnce({ accepted: ["terms"] });

    await POST(makeRequest());

    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("never fires signup_completed when access still isn't full afterward (e.g. a minor awaiting parent consent)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockHasFullAccess.mockResolvedValue(false);
    mockAcceptLegal.mockResolvedValueOnce({ accepted: ["terms"] });

    await POST(makeRequest());

    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });
});
