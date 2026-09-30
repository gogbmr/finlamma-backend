import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockEnterCurrentCompetition = vi.fn();
vi.mock("@/server/competitions/service", () => ({
  enterCurrentCompetition: (user: unknown, meta: unknown) => mockEnterCurrentCompetition(user, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/arena/competitions/current/enter", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/arena/competitions/current/enter", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockEnterCurrentCompetition).not.toHaveBeenCalled();
  });

  it("returns 404 when there's no active competition", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockEnterCurrentCompetition.mockRejectedValueOnce(new AppError("NOT_FOUND", "No active competition right now"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
  });

  it("returns 403 when trading is locked", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockEnterCurrentCompetition.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Trading is locked until you clear more worlds"),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns 409 once the entry window has closed", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockEnterCurrentCompetition.mockRejectedValueOnce(
      new AppError("COMPETITION_ENTRY_CLOSED", "Entry for this competition has closed"),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
  });

  it("enters and returns the entry", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockEnterCurrentCompetition.mockResolvedValueOnce({
      id: "entry_1",
      competitionId: "comp_1",
      cashPaise: 10_000_000,
      qtyHeld: 0,
      enteredAt: new Date("2026-10-05T00:00:00.000Z"),
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("entry_1");
    expect(body.data.enteredAt).toBe("2026-10-05T00:00:00.000Z");
  });
});
