import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCertificate = vi.fn();
const mockInsertCertificateIfAbsent = vi.fn();
const mockCountCertificatesForWorldSinceYearStart = vi.fn();
const mockListCertificatesForUser = vi.fn();
const mockSetCertificateFileKey = vi.fn();
vi.mock("./repo", () => ({
  getCertificate: (userId: unknown, worldId: unknown) => mockGetCertificate(userId, worldId),
  insertCertificateIfAbsent: (input: unknown) => mockInsertCertificateIfAbsent(input),
  countCertificatesForWorldSinceYearStart: (worldId: unknown, since: unknown) =>
    mockCountCertificatesForWorldSinceYearStart(worldId, since),
  listCertificatesForUser: (userId: unknown) => mockListCertificatesForUser(userId),
  setCertificateFileKey: (id: unknown, fileKey: unknown) => mockSetCertificateFileKey(id, fileKey),
}));

const mockGetWorldById = vi.fn();
vi.mock("@/server/worlds/repo", () => ({
  getWorldById: (id: unknown) => mockGetWorldById(id),
}));

const mockGetLevelInfo = vi.fn();
vi.mock("@/server/leveling/service", () => ({
  getLevelInfo: (userId: unknown) => mockGetLevelInfo(userId),
}));

const mockUploadObject = vi.fn();
const mockGetSignedDownloadUrl = vi.fn();
vi.mock("@/lib/s3", () => ({
  uploadObject: (key: unknown, body: unknown, contentType: unknown) =>
    mockUploadObject(key, body, contentType),
  getSignedDownloadUrl: (key: unknown) => mockGetSignedDownloadUrl(key),
}));

const mockRenderCertificatePdf = vi.fn();
vi.mock("./pdf", () => ({
  renderCertificatePdf: (data: unknown) => mockRenderCertificatePdf(data),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", () => ({
  logInternalError: (errorId: unknown, err: unknown) => mockLogInternalError(errorId, err),
}));

import {
  getCertificatePdfUrl,
  getMyCertificate,
  issueCertificateIfEligible,
  listMyCertificates,
} from "./service";

const USER = { id: "user_1", firstName: "Aarav", lastInitial: "S" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const WORLD = { id: "world_1", code: "MW", title: { en: "Money World", hi: "x", hx: "x" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("issueCertificateIfEligible", () => {
  it("is a no-op if a certificate already exists for this (user, world)", async () => {
    mockGetCertificate.mockResolvedValueOnce({ id: "cert_1" });

    const result = await issueCertificateIfEligible(USER, WORLD.id, 90, META);

    expect(result).toEqual({ id: "cert_1" });
    expect(mockInsertCertificateIfAbsent).not.toHaveBeenCalled();
  });

  it("issues a certificate with the world's code and the learner's current total XP", async () => {
    mockGetCertificate.mockResolvedValueOnce(null);
    mockGetWorldById.mockResolvedValueOnce(WORLD);
    mockGetLevelInfo.mockResolvedValueOnce({ level: 5, totalXp: 1500 });
    mockCountCertificatesForWorldSinceYearStart.mockResolvedValueOnce(0);
    mockInsertCertificateIfAbsent.mockResolvedValueOnce({
      id: "cert_1",
      code: "FL-MW-2026-000001",
      xpEarned: 1500,
      accuracyPct: 90,
    });

    const result = await issueCertificateIfEligible(USER, WORLD.id, 90, META);

    expect(mockInsertCertificateIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER.id,
        worldId: WORLD.id,
        xpEarned: 1500,
        accuracyPct: 90,
        code: expect.stringMatching(/^FL-MW-\d{4}-\d{6}$/),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: "cert_1", code: "FL-MW-2026-000001" }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "certificate.issued", actorId: USER.id }),
    );
  });

  it("skips (logs, doesn't throw) when the world has no code yet", async () => {
    mockGetCertificate.mockResolvedValueOnce(null);
    mockGetWorldById.mockResolvedValueOnce({ ...WORLD, code: null });

    const result = await issueCertificateIfEligible(USER, WORLD.id, 90, META);

    expect(result).toBeNull();
    expect(mockLogInternalError).toHaveBeenCalledWith("certificates.world_missing_code", expect.any(Error));
    expect(mockInsertCertificateIfAbsent).not.toHaveBeenCalled();
  });

  it("retries with the next sequence number on a code collision, never on a (user, world) collision", async () => {
    mockGetCertificate.mockResolvedValueOnce(null);
    mockGetWorldById.mockResolvedValueOnce(WORLD);
    mockGetLevelInfo.mockResolvedValueOnce({ level: 5, totalXp: 1500 });
    mockCountCertificatesForWorldSinceYearStart.mockResolvedValueOnce(0);
    mockInsertCertificateIfAbsent
      .mockRejectedValueOnce({ code: "23505" }) // first sequence number taken
      .mockResolvedValueOnce({ id: "cert_1", code: "FL-MW-2026-000002" });

    const result = await issueCertificateIfEligible(USER, WORLD.id, 90, META);

    expect(mockInsertCertificateIfAbsent).toHaveBeenCalledTimes(2);
    expect(mockInsertCertificateIfAbsent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ code: expect.stringMatching(/-000001$/) }),
    );
    expect(mockInsertCertificateIfAbsent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ code: expect.stringMatching(/-000002$/) }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "cert_1" }));
  });

  it("re-reads the existing row if it lost an (user, world) race mid-insert", async () => {
    mockGetCertificate
      .mockResolvedValueOnce(null) // initial check
      .mockResolvedValueOnce({ id: "cert_existing" }); // re-read after losing the race
    mockGetWorldById.mockResolvedValueOnce(WORLD);
    mockGetLevelInfo.mockResolvedValueOnce({ level: 5, totalXp: 1500 });
    mockCountCertificatesForWorldSinceYearStart.mockResolvedValueOnce(0);
    mockInsertCertificateIfAbsent.mockResolvedValueOnce(null); // onConflictDoNothing target hit

    const result = await issueCertificateIfEligible(USER, WORLD.id, 90, META);

    expect(result).toEqual({ id: "cert_existing" });
  });
});

describe("listMyCertificates", () => {
  it("joins each certificate with its world title", async () => {
    mockListCertificatesForUser.mockResolvedValueOnce([
      { worldId: "world_1", code: "FL-MW-2026-000001", xpEarned: 1500, accuracyPct: 90, createdAt: new Date() },
    ]);
    mockGetWorldById.mockResolvedValueOnce(WORLD);

    const result = await listMyCertificates(USER.id);

    expect(result).toEqual([
      expect.objectContaining({ worldId: "world_1", worldTitle: WORLD.title, code: "FL-MW-2026-000001" }),
    ]);
  });
});

describe("getMyCertificate", () => {
  it("throws NOT_FOUND when the user hasn't completed this world", async () => {
    mockGetCertificate.mockResolvedValueOnce(null);

    await expect(getMyCertificate(USER.id, WORLD.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getCertificatePdfUrl", () => {
  it("returns a signed URL immediately when the PDF was already rendered", async () => {
    mockGetCertificate.mockResolvedValueOnce({ id: "cert_1", fileKey: "certificates/cert_1.pdf" });
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/cert_1.pdf");

    const url = await getCertificatePdfUrl(USER, WORLD.id);

    expect(url).toBe("https://signed.example/cert_1.pdf");
    expect(mockRenderCertificatePdf).not.toHaveBeenCalled();
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("renders and uploads the PDF lazily on first request", async () => {
    mockGetCertificate.mockResolvedValueOnce({
      id: "cert_1",
      fileKey: null,
      code: "FL-MW-2026-000001",
      xpEarned: 1500,
      accuracyPct: 90,
      createdAt: new Date("2026-04-17T00:00:00.000Z"),
    });
    mockGetWorldById.mockResolvedValueOnce(WORLD);
    mockRenderCertificatePdf.mockResolvedValueOnce(Buffer.from("pdf-bytes"));
    mockSetCertificateFileKey.mockResolvedValueOnce({ fileKey: "certificates/cert_1.pdf" });
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/cert_1.pdf");

    const url = await getCertificatePdfUrl(USER, WORLD.id);

    expect(mockRenderCertificatePdf).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Aarav S", worldTitle: "Money World", code: "FL-MW-2026-000001" }),
    );
    expect(mockUploadObject).toHaveBeenCalledWith("certificates/cert_1.pdf", expect.any(Buffer), "application/pdf");
    expect(url).toBe("https://signed.example/cert_1.pdf");
  });

  it("throws NOT_FOUND when the user hasn't completed this world", async () => {
    mockGetCertificate.mockResolvedValueOnce(null);

    await expect(getCertificatePdfUrl(USER, WORLD.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
