import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db client so this test never touches a real database and never
// triggers env.ts validation (which needs real DATABASE_URL etc.).
vi.mock("@/db/client", () => ({
  db: { execute: vi.fn() },
}));

function clerkKey(host: string) {
  return "pk_test_" + Buffer.from(`${host}$`).toString("base64");
}

const STAFF_HOST = "staff-app.clerk.accounts.dev";
const CONSUMER_HOST = "consumer-app.clerk.accounts.dev";

const mockEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
  CONSUMER_CLERK_PUBLISHABLE_KEY: undefined as string | undefined,
  VERCEL_GIT_COMMIT_SHA: undefined as string | undefined,
  CONSENT_PII_HMAC_KEY: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockListPublishedDocuments = vi.fn();
vi.mock("@/server/legal/repo", () => ({
  LEGAL_DOCUMENT_TYPES: ["terms", "privacy", "risk_disclosure"],
  listPublishedDocuments: () => mockListPublishedDocuments(),
}));

import { db } from "@/db/client";
import { GET } from "./route";

function publishedDoc(overrides: Partial<{ isPlaceholder: boolean }> = {}) {
  return { type: "terms", version: 1, isPlaceholder: false, ...overrides };
}

beforeEach(() => {
  // Distinct staff/consumer hosts by default, so existing tests below don't
  // need to know about the Clerk-key check at all.
  mockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkKey(STAFF_HOST);
  mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = clerkKey(CONSUMER_HOST);
  mockEnv.VERCEL_GIT_COMMIT_SHA = undefined;
  mockEnv.CONSENT_PII_HMAC_KEY = "test-hmac-key";
  // All three types published, none placeholder - existing tests below
  // don't need to know about the legalDocuments warning field at all.
  mockListPublishedDocuments.mockReset().mockResolvedValue([
    publishedDoc(),
    publishedDoc(),
    publishedDoc(),
  ]);
});

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
    expect(body.data.clerkKeys).toBe("ok");
    expect(body.data.legalDocuments).toBe("ok");
    expect(body.data.version).toBe("local");
    expect(body.data.consentPiiHmacKey).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
  });

  it("reports legalDocuments: placeholder without failing the check, when a published document is seeded filler text", async () => {
    mockHealthyDb();
    mockListPublishedDocuments.mockResolvedValue([
      publishedDoc({ isPlaceholder: true }),
      publishedDoc(),
      publishedDoc(),
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.legalDocuments).toBe("placeholder");
  });

  it("reports legalDocuments: unpublished without failing the check, when a document type has never been published", async () => {
    mockHealthyDb();
    mockListPublishedDocuments.mockResolvedValue([publishedDoc(), publishedDoc()]); // only 2 of 3

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.legalDocuments).toBe("unpublished");
  });

  it("reports legalDocuments: unpublished (not a 503) if the check itself throws", async () => {
    mockHealthyDb();
    mockListPublishedDocuments.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.legalDocuments).toBe("unpublished");
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
    // Diagnostic details so a mismatch is readable straight from the health
    // check's own response - e.g. distinguishing "nobody ran db:migrate"
    // from "this deployment's DATABASE_URL points at the wrong database".
    expect(body.error.details.actualLatestAppliedAtMs).toBe(1);
    expect(typeof body.error.details.expectedMigration).toBe("string");
    expect(typeof body.error.details.expectedAppliedAtMs).toBe("number");
  });

  it("returns 503 with details when the migrations table is empty (max() returns null)", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce(undefined as never) // select 1 succeeds
      .mockResolvedValueOnce([{ latest: null }] as never); // no rows applied

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.details.actualLatestAppliedAtMs).toBeNull();
  });

  it("returns 503 when drizzle.__drizzle_migrations doesn't exist or errors", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce(undefined as never) // select 1 succeeds
      .mockRejectedValueOnce(new Error('relation "drizzle.__drizzle_migrations" does not exist'));

    const res = await GET();

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 before ever touching the database when the staff and consumer Clerk keys are the same app", async () => {
    mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = clerkKey(STAFF_HOST); // same host as staff

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toMatch(/same Clerk application/i);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("treats an unconfigured consumer Clerk key as a non-failing 'unconfigured' status", async () => {
    mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = undefined;
    mockHealthyDb();

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.clerkKeys).toBe("unconfigured");
  });

  it("reports the deployed commit's short SHA as `version` when VERCEL_GIT_COMMIT_SHA is set", async () => {
    mockEnv.VERCEL_GIT_COMMIT_SHA = "2d303f6a1b2c3d4e5f60718293a4b5c6d7e8f9a0";
    mockHealthyDb();

    const res = await GET();

    expect((await res.json()).data.version).toBe("2d303f6");
  });

  it("reports version: 'local' when VERCEL_GIT_COMMIT_SHA is unset (local dev, tests)", async () => {
    mockEnv.VERCEL_GIT_COMMIT_SHA = undefined;
    mockHealthyDb();

    const res = await GET();

    expect((await res.json()).data.version).toBe("local");
  });

  it("reports consentPiiHmacKey: 'missing' (not a 503) when CONSENT_PII_HMAC_KEY isn't configured", async () => {
    mockEnv.CONSENT_PII_HMAC_KEY = undefined;
    mockHealthyDb();

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.consentPiiHmacKey).toBe("missing");
  });
});
