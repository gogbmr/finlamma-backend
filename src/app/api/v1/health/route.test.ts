import { describe, expect, it, vi } from "vitest";

// Mock the db client so this test never touches a real database and never
// triggers env.ts validation (which needs real DATABASE_URL etc.).
vi.mock("@/db/client", () => ({
  db: { execute: vi.fn() },
}));

import { db } from "@/db/client";
import { GET } from "./route";

// The route calls db.execute() twice: once for the `select 1` ping, once
// for the migrations-applied check. latestAppliedMs defaults to matching
// whatever the bundled drizzle/meta/_journal.json's last entry is, via a
// value bigger than any real timestamp, so tests don't need to know it
// exactly - only the "pending" tests need a specific stale value.
function mockHealthyDb(latestAppliedMs = Number.MAX_SAFE_INTEGER) {
  vi.mocked(db.execute)
    .mockResolvedValueOnce(undefined as never) // select 1
    .mockResolvedValueOnce([{ latest: String(latestAppliedMs) }] as never); // migrations check
}

describe("GET /api/v1/health", () => {
  it("returns 200 with status ok when the database responds and migrations are current", async () => {
    mockHealthyDb();

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("ok");
    expect(body.data.database).toBe("ok");
    expect(body.data.migrations).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
  });

  it("returns 503 with SERVICE_UNAVAILABLE when the database is unreachable", async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when the database is reachable but a migration hasn't been applied", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce(undefined as never) // select 1 succeeds
      .mockResolvedValueOnce([{ latest: "1" }] as never); // absurdly old/stale

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toMatch(/migrations/i);
  });

  it("returns 503 when drizzle.__drizzle_migrations doesn't exist or errors", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce(undefined as never) // select 1 succeeds
      .mockRejectedValueOnce(new Error('relation "drizzle.__drizzle_migrations" does not exist'));

    const res = await GET();

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
