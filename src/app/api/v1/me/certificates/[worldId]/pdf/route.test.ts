import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetCertificatePdfUrl = vi.fn();
vi.mock("@/server/certificates/service", () => ({
  getCertificatePdfUrl: (user: unknown, worldId: unknown) => mockGetCertificatePdfUrl(user, worldId),
}));

import { GET } from "./route";

const USER = { id: "u1", firstName: "Aarav", lastInitial: "S" };
const WORLD_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeRequest() {
  return new Request(`http://localhost/api/v1/me/certificates/${WORLD_ID}/pdf`);
}
function makeParams(worldId = WORLD_ID) {
  return { params: Promise.resolve({ worldId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/certificates/[worldId]/pdf", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockGetCertificatePdfUrl).not.toHaveBeenCalled();
  });

  it("returns 404 when no certificate exists for this world", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCertificatePdfUrl.mockRejectedValueOnce(
      new AppError("NOT_FOUND", "No certificate for this world yet"),
    );

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(404);
  });

  it("returns 503 when storage isn't configured", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCertificatePdfUrl.mockRejectedValueOnce(
      new AppError("SERVICE_UNAVAILABLE", "Storage is not configured"),
    );

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(503);
  });

  it("returns a signed URL, passing the whole authenticated user through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCertificatePdfUrl.mockResolvedValueOnce("https://signed.example/cert.pdf");

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe("https://signed.example/cert.pdf");
    expect(mockGetCertificatePdfUrl).toHaveBeenCalledWith(USER, WORLD_ID);
  });
});
