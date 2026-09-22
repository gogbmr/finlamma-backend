import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockCompleteOnboarding = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  completeOnboarding: (user: unknown, meta: unknown) => mockCompleteOnboarding(user, meta),
}));

import { PATCH } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/onboarding-complete", { method: "PATCH" });
}

describe("PATCH /api/v1/me/onboarding-complete", () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockCompleteOnboarding.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(401);
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
  });

  it("marks onboarding complete and returns the timestamp", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockCompleteOnboarding.mockResolvedValueOnce({
      onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await PATCH(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.onboardingCompletedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
