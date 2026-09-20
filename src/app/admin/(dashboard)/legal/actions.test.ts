import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireStaff = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: unknown) => mockRevalidatePath(path),
}));

const mockPublishLegalDocument = vi.fn();
vi.mock("@/server/legal/service", () => ({
  publishLegalDocument: (actor: unknown, type: unknown, requiresParentReapproval: unknown, meta: unknown) =>
    mockPublishLegalDocument(actor, type, requiresParentReapproval, meta),
  upsertLegalDraft: vi.fn(),
}));

const mockNotifyAffectedMinorsForReapproval = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  notifyAffectedMinorsForReapproval: (legalDocumentId: unknown, meta: unknown) =>
    mockNotifyAffectedMinorsForReapproval(legalDocumentId, meta),
}));

import { publishLegalDocumentAction } from "./actions";

const ACTOR = { id: "staff1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStaff.mockResolvedValue(ACTOR);
});

describe("publishLegalDocumentAction - the Yes/No re-approval choice", () => {
  it("rejects a publish with requiresParentReapproval missing entirely - nothing gets published", async () => {
    const result = await publishLegalDocumentAction({ type: "terms" });

    expect(result.ok).toBe(false);
    expect(mockPublishLegalDocument).not.toHaveBeenCalled();
    expect(mockNotifyAffectedMinorsForReapproval).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a publish with requiresParentReapproval explicitly undefined - nothing gets published", async () => {
    const result = await publishLegalDocumentAction({
      type: "terms",
      requiresParentReapproval: undefined,
    });

    expect(result.ok).toBe(false);
    expect(mockPublishLegalDocument).not.toHaveBeenCalled();
  });

  it("rejects a publish with requiresParentReapproval as null - nothing gets published", async () => {
    const result = await publishLegalDocumentAction({ type: "terms", requiresParentReapproval: null });

    expect(result.ok).toBe(false);
    expect(mockPublishLegalDocument).not.toHaveBeenCalled();
  });

  it("publishes with no re-approval notification when requiresParentReapproval is explicitly false", async () => {
    mockPublishLegalDocument.mockResolvedValueOnce({
      id: "doc_1",
      type: "terms",
      version: 2,
      requiresParentReapproval: false,
    });

    const result = await publishLegalDocumentAction({ type: "terms", requiresParentReapproval: false });

    expect(result.ok).toBe(true);
    expect(mockPublishLegalDocument).toHaveBeenCalledWith(ACTOR, "terms", false, expect.any(Object));
    expect(mockNotifyAffectedMinorsForReapproval).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/legal");
  });

  it("publishes and triggers re-approval notification when requiresParentReapproval is explicitly true", async () => {
    mockPublishLegalDocument.mockResolvedValueOnce({
      id: "doc_2",
      type: "terms",
      version: 3,
      requiresParentReapproval: true,
    });

    const result = await publishLegalDocumentAction({ type: "terms", requiresParentReapproval: true });

    expect(result.ok).toBe(true);
    expect(mockPublishLegalDocument).toHaveBeenCalledWith(ACTOR, "terms", true, expect.any(Object));
    expect(mockNotifyAffectedMinorsForReapproval).toHaveBeenCalledWith("doc_2", expect.any(Object));
  });

  // publishLegalDocument (src/server/legal/repo.ts publishDraft) forces
  // requiresParentReapproval to false for a placeholder draft regardless of
  // what staff pass in - this action must trust that returned, post-override
  // value (published.requiresParentReapproval), not the raw input, when
  // deciding whether to notify. A staff member mis-clicking "Yes" on a
  // placeholder must never trigger a wave of parent-notification emails.
  it("never notifies for a placeholder draft, even if staff passed requiresParentReapproval: true", async () => {
    mockPublishLegalDocument.mockResolvedValueOnce({
      id: "doc_3",
      type: "terms",
      version: 1,
      requiresParentReapproval: false, // publishDraft already forced this false server-side
    });

    const result = await publishLegalDocumentAction({ type: "terms", requiresParentReapproval: true });

    expect(result.ok).toBe(true);
    expect(mockNotifyAffectedMinorsForReapproval).not.toHaveBeenCalled();
  });

  it("never calls publishLegalDocument at all if the caller isn't legal.manage staff", async () => {
    const { AppError } = await import("@/lib/errors");
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: legal.manage"));

    const result = await publishLegalDocumentAction({ type: "terms", requiresParentReapproval: true });

    expect(result.ok).toBe(false);
    expect(mockPublishLegalDocument).not.toHaveBeenCalled();
  });
});
