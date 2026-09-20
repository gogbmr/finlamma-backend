import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPublishedDocument = vi.fn();
const mockListPublishedDocuments = vi.fn();
const mockGetDraftDocument = vi.fn();
const mockGetAcceptances = vi.fn();
const mockInsertAcceptance = vi.fn();
const mockUpsertDraft = vi.fn();
const mockPublishDraft = vi.fn();
vi.mock("./repo", () => ({
  getPublishedDocument: (type: unknown) => mockGetPublishedDocument(type),
  listPublishedDocuments: () => mockListPublishedDocuments(),
  getDraftDocument: (type: unknown) => mockGetDraftDocument(type),
  getAcceptances: (userId: unknown, ids: unknown, by: unknown) =>
    mockGetAcceptances(userId, ids, by),
  insertAcceptance: (userId: unknown, docId: unknown, by: unknown) =>
    mockInsertAcceptance(userId, docId, by),
  upsertDraft: (type: unknown, content: unknown) => mockUpsertDraft(type, content),
  publishDraft: (type: unknown, staffId: unknown, requiresParentReapproval: unknown) =>
    mockPublishDraft(type, staffId, requiresParentReapproval),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  acceptLegal,
  getLegalStatus,
  getPublicDocument,
  publishLegalDocument,
  upsertLegalDraft,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const CONTENT = { en: "en text", hi: "hi text", hx: "hx text" };

function doc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "doc_1",
    type: "terms" as const,
    version: 1,
    content: CONTENT,
    status: "published" as const,
    publishedBy: null,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    isPlaceholder: false,
    requiresParentReapproval: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicDocument", () => {
  it("maps a published row to the public shape", async () => {
    mockGetPublishedDocument.mockResolvedValueOnce(doc());

    const result = await getPublicDocument("terms");

    expect(result).toEqual({
      type: "terms",
      version: 1,
      content: CONTENT,
      publishedAt: "2026-01-01T00:00:00.000Z",
      isPlaceholder: false,
    });
  });

  it("throws NOT_FOUND when nothing is published yet", async () => {
    mockGetPublishedDocument.mockResolvedValueOnce(null);

    await expect(getPublicDocument("terms")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getLegalStatus", () => {
  it("reports accepted:false for a document with no self-acceptance row", async () => {
    mockListPublishedDocuments.mockResolvedValueOnce([doc({ id: "doc_1" })]);
    mockGetAcceptances.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // self, then parent

    const result = await getLegalStatus({ id: "user_1" });

    expect(result).toEqual({
      documents: [
        {
          type: "terms",
          currentVersion: 1,
          accepted: false,
          acceptedAt: null,
          requiresParentReapproval: false,
          parentApproved: true,
        },
      ],
      allAccepted: false,
      allParentApproved: true,
    });
    expect(mockGetAcceptances).toHaveBeenCalledWith("user_1", ["doc_1"], "self");
    expect(mockGetAcceptances).toHaveBeenCalledWith("user_1", ["doc_1"], "parent");
  });

  it("reports allAccepted:true once every published document has a self-acceptance", async () => {
    mockListPublishedDocuments.mockResolvedValueOnce([doc({ id: "doc_1" })]);
    mockGetAcceptances
      .mockResolvedValueOnce([
        {
          id: "acc_1",
          userId: "user_1",
          legalDocumentId: "doc_1",
          acceptedBy: "self",
          acceptedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getLegalStatus({ id: "user_1" });

    expect(result.allAccepted).toBe(true);
    expect(result.documents[0]).toMatchObject({ accepted: true, acceptedAt: "2026-01-02T00:00:00.000Z" });
  });

  it("reports parentApproved:false when a document requires parent reapproval and no parent acceptance exists yet", async () => {
    mockListPublishedDocuments.mockResolvedValueOnce([
      doc({ id: "doc_1", requiresParentReapproval: true }),
    ]);
    mockGetAcceptances.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // self, then parent

    const result = await getLegalStatus({ id: "user_1" });

    expect(result.documents[0]).toMatchObject({ requiresParentReapproval: true, parentApproved: false });
    expect(result.allParentApproved).toBe(false);
  });

  it("reports parentApproved:true once a parent-acceptance row exists for the required document", async () => {
    mockListPublishedDocuments.mockResolvedValueOnce([
      doc({ id: "doc_1", requiresParentReapproval: true }),
    ]);
    mockGetAcceptances.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "acc_1",
        userId: "user_1",
        legalDocumentId: "doc_1",
        acceptedBy: "parent",
        acceptedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    ]);

    const result = await getLegalStatus({ id: "user_1" });

    expect(result.documents[0]).toMatchObject({ requiresParentReapproval: true, parentApproved: true });
    expect(result.allParentApproved).toBe(true);
  });
});

describe("acceptLegal", () => {
  it("inserts a self-acceptance only for documents not already accepted, and logs it", async () => {
    mockListPublishedDocuments.mockResolvedValueOnce([
      doc({ id: "doc_1", type: "terms", version: 1 }),
      doc({ id: "doc_2", type: "privacy", version: 1 }),
    ]);
    mockGetAcceptances.mockResolvedValueOnce([
      {
        id: "acc_1",
        userId: "user_1",
        legalDocumentId: "doc_1",
        acceptedBy: "self",
        acceptedAt: new Date(),
      },
    ]);
    mockInsertAcceptance.mockResolvedValueOnce({ id: "acc_2" });

    const result = await acceptLegal({ id: "user_1" }, META);

    expect(result).toEqual({ accepted: ["privacy"] });
    expect(mockInsertAcceptance).toHaveBeenCalledTimes(1);
    expect(mockInsertAcceptance).toHaveBeenCalledWith("user_1", "doc_2", "self");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "legal.accepted", actorId: "user_1" }),
    );
  });

  it("does nothing and logs nothing when everything is already accepted", async () => {
    mockListPublishedDocuments.mockResolvedValueOnce([doc({ id: "doc_1" })]);
    mockGetAcceptances.mockResolvedValueOnce([
      { id: "acc_1", userId: "user_1", legalDocumentId: "doc_1", acceptedBy: "self", acceptedAt: new Date() },
    ]);

    const result = await acceptLegal({ id: "user_1" }, META);

    expect(result).toEqual({ accepted: [] });
    expect(mockInsertAcceptance).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("upsertLegalDraft", () => {
  it("saves the draft and logs it under the staff actor", async () => {
    mockUpsertDraft.mockResolvedValueOnce(doc({ id: "draft_1", status: "draft", version: 2 }));

    const result = await upsertLegalDraft({ id: "staff_1" }, "terms", CONTENT, META);

    expect(mockUpsertDraft).toHaveBeenCalledWith("terms", CONTENT);
    expect(result.id).toBe("draft_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorId: "staff_1",
        action: "legal.draft_saved",
      }),
    );
  });
});

describe("publishLegalDocument", () => {
  it("throws NOT_FOUND when there is no draft to publish", async () => {
    mockPublishDraft.mockResolvedValueOnce(null);

    await expect(publishLegalDocument({ id: "staff_1" }, "terms", false, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("publishes the draft and logs it, passing requiresParentReapproval through to publishDraft", async () => {
    mockPublishDraft.mockResolvedValueOnce(doc({ id: "doc_2", version: 2, requiresParentReapproval: true }));

    const result = await publishLegalDocument({ id: "staff_1" }, "terms", true, META);

    expect(mockPublishDraft).toHaveBeenCalledWith("terms", "staff_1", true);
    expect(result.id).toBe("doc_2");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "legal.published",
        actorId: "staff_1",
        metadata: expect.objectContaining({ requiresParentReapproval: true }),
      }),
    );
  });
});
