import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockSetDateOfBirth = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  setDateOfBirth: (user: unknown, input: unknown, meta: unknown) =>
    mockSetDateOfBirth(user, input, meta),
}));

import { PATCH } from "./route";

const USER = { id: "u1", dateOfBirth: null };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/date-of-birth", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/v1/me/date-of-birth", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockSetDateOfBirth.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await PATCH(makeRequest({ dateOfBirth: "2010-01-01" }));

    expect(res.status).toBe(401);
    expect(mockSetDateOfBirth).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed date", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);

    const res = await PATCH(makeRequest({ dateOfBirth: "not-a-date" }));

    expect(res.status).toBe(400);
    expect(mockSetDateOfBirth).not.toHaveBeenCalled();
  });

  it("returns 409 when already set", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockSetDateOfBirth.mockRejectedValueOnce(
      new AppError("CONFLICT", "Date of birth is already set - contact support to correct it"),
    );

    const res = await PATCH(makeRequest({ dateOfBirth: "2010-01-01" }));

    expect(res.status).toBe(409);
  });

  // App asks batch, section C2.
  it("returns 403 AGE_BELOW_MINIMUM for an under-13 date", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockSetDateOfBirth.mockRejectedValueOnce(
      new AppError("AGE_BELOW_MINIMUM", "You must be at least 13 years old to use Finlamma"),
    );

    const res = await PATCH(makeRequest({ dateOfBirth: "2018-01-01" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("AGE_BELOW_MINIMUM");
  });

  it("sets the date of birth and returns the status", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockSetDateOfBirth.mockResolvedValueOnce({
      dateOfBirth: "2010-01-01",
      isMinor: true,
      requiresParentConsent: true,
    });

    const res = await PATCH(makeRequest({ dateOfBirth: "2010-01-01" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isMinor).toBe(true);
  });
});
