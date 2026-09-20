import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockResendReapprovalRequests = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  resendReapprovalRequests: (user: unknown, meta: unknown) => mockResendReapprovalRequests(user, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/legal/reapproval/resend", { method: "POST" });
}

describe("POST /api/v1/me/legal/reapproval/resend", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockResendReapprovalRequests.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockResendReapprovalRequests).not.toHaveBeenCalled();
  });

  it("returns 409 when there's no pending re-approval", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockResendReapprovalRequests.mockRejectedValueOnce(
      new AppError("CONSENT_NOT_NEEDED", "There's no pending re-approval for this account"),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONSENT_NOT_NEEDED");
  });

  it("returns 429 when the resend cooldown hasn't passed", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockResendReapprovalRequests.mockRejectedValueOnce(
      new AppError("RESEND_TOO_SOON", "Please wait a bit before requesting another email", {
        retryAfterSeconds: 30,
      }),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
  });

  it("resends and returns the count", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockResendReapprovalRequests.mockResolvedValueOnce({ resent: 1 });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.resent).toBe(1);
  });
});
