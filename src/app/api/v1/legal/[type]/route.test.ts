import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockGetPublicDocument = vi.fn();
vi.mock("@/server/legal/service", () => ({
  getPublicDocument: (type: unknown) => mockGetPublicDocument(type),
}));

import { GET } from "./route";

function makeRequest() {
  return new Request("http://localhost/api/v1/legal/terms");
}

describe("GET /api/v1/legal/[type]", () => {
  beforeEach(() => {
    mockGetPublicDocument.mockReset();
  });

  it("returns the published document for a valid type", async () => {
    mockGetPublicDocument.mockResolvedValueOnce({
      type: "terms",
      version: 1,
      content: { en: "a", hi: "b", hx: "c" },
      publishedAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await GET(makeRequest(), { params: Promise.resolve({ type: "terms" }) });

    expect(res.status).toBe(200);
    expect(mockGetPublicDocument).toHaveBeenCalledWith("terms");
    const body = await res.json();
    expect(body.data.type).toBe("terms");
  });

  it("returns 400 for an unknown document type, without calling the service", async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({ type: "bogus" }) });

    expect(res.status).toBe(400);
    expect(mockGetPublicDocument).not.toHaveBeenCalled();
  });

  it("returns 404 when nothing has been published yet", async () => {
    mockGetPublicDocument.mockRejectedValueOnce(
      new AppError("NOT_FOUND", "No published terms document yet"),
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ type: "terms" }) });

    expect(res.status).toBe(404);
  });
});
