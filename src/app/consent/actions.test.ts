import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockConfirmParentConsent = vi.fn();
const mockDeclineParentConsent = vi.fn();
const mockWithdrawParentConsent = vi.fn();
const mockApproveReapproval = vi.fn();
const mockDeclineReapproval = vi.fn();
const mockUnsubscribeWeeklyReport = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  confirmParentConsent: (token: unknown, meta: unknown, optIn: unknown) =>
    mockConfirmParentConsent(token, meta, optIn),
  declineParentConsent: (token: unknown, meta: unknown) => mockDeclineParentConsent(token, meta),
  withdrawParentConsent: (token: unknown, meta: unknown) => mockWithdrawParentConsent(token, meta),
  approveReapproval: (token: unknown, meta: unknown, optIn: unknown) =>
    mockApproveReapproval(token, meta, optIn),
  declineReapproval: (token: unknown, meta: unknown) => mockDeclineReapproval(token, meta),
  unsubscribeWeeklyReport: (token: unknown, meta: unknown) => mockUnsubscribeWeeklyReport(token, meta),
}));

import {
  approveReapprovalAction,
  confirmParentConsentAction,
  unsubscribeWeeklyReportAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmParentConsentAction", () => {
  it("default off - passes false when the caller omits the opt-in checkbox", async () => {
    mockConfirmParentConsent.mockResolvedValueOnce({ childFirstName: "Aarav" });

    await confirmParentConsentAction("tok");

    expect(mockConfirmParentConsent).toHaveBeenCalledWith("tok", expect.any(Object), false);
  });

  it("opt-in path - passes true through when the checkbox was checked", async () => {
    mockConfirmParentConsent.mockResolvedValueOnce({ childFirstName: "Aarav" });

    const result = await confirmParentConsentAction("tok", true);

    expect(result).toEqual({ ok: true, childFirstName: "Aarav" });
    expect(mockConfirmParentConsent).toHaveBeenCalledWith("tok", expect.any(Object), true);
  });

  it("surfaces an AppError as a plain result instead of throwing", async () => {
    mockConfirmParentConsent.mockRejectedValueOnce(new AppError("NOT_FOUND", "This consent link is invalid"));

    const result = await confirmParentConsentAction("tok");

    expect(result).toEqual({ ok: false, error: "This consent link is invalid" });
  });
});

describe("approveReapprovalAction", () => {
  it("default off - passes false when the caller omits the opt-in checkbox", async () => {
    mockApproveReapproval.mockResolvedValueOnce({ childFirstName: "Aarav" });

    await approveReapprovalAction("tok");

    expect(mockApproveReapproval).toHaveBeenCalledWith("tok", expect.any(Object), false);
  });

  it("passes true through when the checkbox was checked", async () => {
    mockApproveReapproval.mockResolvedValueOnce({ childFirstName: "Aarav" });

    await approveReapprovalAction("tok", true);

    expect(mockApproveReapproval).toHaveBeenCalledWith("tok", expect.any(Object), true);
  });
});

describe("unsubscribeWeeklyReportAction", () => {
  it("returns ok with alreadyUnsubscribed passed through", async () => {
    mockUnsubscribeWeeklyReport.mockResolvedValueOnce({ childFirstName: "Aarav", alreadyUnsubscribed: false });

    const result = await unsubscribeWeeklyReportAction("tok");

    expect(result).toEqual({ ok: true, childFirstName: "Aarav", alreadyUnsubscribed: false });
  });

  it("surfaces an AppError as a plain result instead of throwing", async () => {
    mockUnsubscribeWeeklyReport.mockRejectedValueOnce(new AppError("NOT_FOUND", "This link is invalid"));

    const result = await unsubscribeWeeklyReportAction("tok");

    expect(result).toEqual({ ok: false, error: "This link is invalid" });
  });
});
