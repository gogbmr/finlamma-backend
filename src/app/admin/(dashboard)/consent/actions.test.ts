import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireStaff = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockRevealParentContact = vi.fn();
const mockCorrectDateOfBirthForAdmin = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  revealParentContact: (actor: unknown, userId: unknown, meta: unknown) =>
    mockRevealParentContact(actor, userId, meta),
  correctDateOfBirthForAdmin: (actor: unknown, input: unknown, meta: unknown) =>
    mockCorrectDateOfBirthForAdmin(actor, input, meta),
}));

import { correctDateOfBirthAction } from "./actions";

const ACTOR = { id: "staff_1" };
const VALID_INPUT = {
  userId: "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b",
  newDateOfBirth: "2011-06-15",
  reason: "Parent provided birth certificate",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// App asks batch, section C3 - consent.correct_dob (super_admin only).
describe("correctDateOfBirthAction", () => {
  it("rejects staff without consent.correct_dob, without calling the service", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: consent.correct_dob"));

    const result = await correctDateOfBirthAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: consent.correct_dob" });
    expect(mockCorrectDateOfBirthForAdmin).not.toHaveBeenCalled();
  });

  describe("once authorized", () => {
    beforeEach(() => {
      mockRequireStaff.mockResolvedValue(ACTOR);
    });

    it("rejects an invalid userId (not a uuid) without calling the service", async () => {
      const result = await correctDateOfBirthAction({ ...VALID_INPUT, userId: "not-a-uuid" });

      expect(result.ok).toBe(false);
      expect(mockCorrectDateOfBirthForAdmin).not.toHaveBeenCalled();
    });

    it("rejects an invalid date string without calling the service", async () => {
      const result = await correctDateOfBirthAction({ ...VALID_INPUT, newDateOfBirth: "not-a-date" });

      expect(result.ok).toBe(false);
      expect(mockCorrectDateOfBirthForAdmin).not.toHaveBeenCalled();
    });

    it("rejects a blank reason without calling the service", async () => {
      const result = await correctDateOfBirthAction({ ...VALID_INPUT, reason: "   " });

      expect(result.ok).toBe(false);
      expect(mockCorrectDateOfBirthForAdmin).not.toHaveBeenCalled();
    });

    it("maps an AppError from the service (e.g. AGE_BELOW_MINIMUM) to {ok:false, error}", async () => {
      mockCorrectDateOfBirthForAdmin.mockRejectedValueOnce(
        new AppError("AGE_BELOW_MINIMUM", "You must be at least 13 years old to use Finlamma"),
      );

      const result = await correctDateOfBirthAction(VALID_INPUT);

      expect(result).toEqual({ ok: false, error: "You must be at least 13 years old to use Finlamma" });
    });

    it("on success: calls the service with the parsed input and returns {ok:true, dateOfBirth, isMinor}", async () => {
      mockCorrectDateOfBirthForAdmin.mockResolvedValueOnce({
        userId: VALID_INPUT.userId,
        dateOfBirth: "2011-06-15",
        isMinor: true,
      });

      const result = await correctDateOfBirthAction(VALID_INPUT);

      expect(result).toEqual({ ok: true, dateOfBirth: "2011-06-15", isMinor: true });
      expect(mockCorrectDateOfBirthForAdmin).toHaveBeenCalledWith(
        ACTOR,
        VALID_INPUT,
        expect.any(Object),
      );
    });
  });
});
