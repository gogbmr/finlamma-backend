import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockRequestParentConsent = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requestParentConsent: (user: unknown, input: unknown, meta: unknown) =>
    mockRequestParentConsent(user, input, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/parent-consent/request", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/v1/me/parent-consent/request", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockRequestParentConsent.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({ parentName: "Priya", parentEmail: "priya@example.com" }));

    expect(res.status).toBe(401);
    expect(mockRequestParentConsent).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);

    const res = await POST(makeRequest({ parentName: "Priya", parentEmail: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(mockRequestParentConsent).not.toHaveBeenCalled();
  });

  it("returns 409 with the domain error code when consent isn't needed", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequestParentConsent.mockRejectedValueOnce(
      new AppError("CONSENT_NOT_NEEDED", "Set your date of birth first"),
    );

    const res = await POST(makeRequest({ parentName: "Priya", parentEmail: "priya@example.com" }));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONSENT_NOT_NEEDED");
  });

  it("returns 429 when the resend cooldown hasn't passed", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequestParentConsent.mockRejectedValueOnce(
      new AppError("RESEND_TOO_SOON", "Please wait a bit before requesting another email", {
        retryAfterSeconds: 30,
      }),
    );

    const res = await POST(makeRequest({ parentName: "Priya", parentEmail: "priya@example.com" }));

    expect(res.status).toBe(429);
  });

  it("sends the request and returns pending status", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequestParentConsent.mockResolvedValueOnce({
      status: "pending",
      parentEmail: "priya@example.com",
    });

    const res = await POST(makeRequest({ parentName: "Priya", parentEmail: "priya@example.com" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("pending");
  });
});
