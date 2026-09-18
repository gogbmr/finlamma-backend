import { describe, expect, it, vi } from "vitest";

// Mock the db client so this test never touches a real database and never
// triggers env.ts validation (which needs real DATABASE_URL etc.).
vi.mock("@/db/client", () => ({
  db: { execute: vi.fn() },
}));

import { db } from "@/db/client";
import { GET } from "./route";

describe("GET /api/v1/health", () => {
  it("returns 200 with status ok when the database responds", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce(undefined as never);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("ok");
    expect(body.data.database).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
  });

  it("returns 503 with SERVICE_UNAVAILABLE when the database is unreachable", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
