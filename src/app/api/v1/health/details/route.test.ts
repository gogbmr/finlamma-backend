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
  RELAY_SHARED_SECRET: undefined as string | undefined,
  S3_ENDPOINT: undefined as string | undefined,
  S3_REGION: undefined as string | undefined,
  S3_BUCKET: undefined as string | undefined,
  S3_ACCESS_KEY_ID: undefined as string | undefined,
  S3_SECRET_ACCESS_KEY: undefined as string | undefined,
  INNGEST_SIGNING_KEY: undefined as string | undefined,
  VERCEL_ENV: undefined as string | undefined,
  TWELVEDATA_API_KEY: undefined as string | undefined,
  MARKET_DATA_PROVIDER: undefined as "mock" | "twelvedata" | undefined,
  APP_URL: "https://finlamma-backend-rho.vercel.app",
  VERCEL_URL: undefined as string | undefined,
  VERCEL_PROJECT_PRODUCTION_URL: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockListPublishedDocuments = vi.fn();
vi.mock("@/server/legal/repo", () => ({
  LEGAL_DOCUMENT_TYPES: ["terms", "privacy", "risk_disclosure"],
  listPublishedDocuments: () => mockListPublishedDocuments(),
}));

const mockListPublishedWorlds = vi.fn();
vi.mock("@/server/worlds/repo", () => ({
  listPublishedWorlds: () => mockListPublishedWorlds(),
}));

const mockListPublishedLessonsByWorldId = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  listPublishedLessonsByWorldId: (worldId: unknown) => mockListPublishedLessonsByWorldId(worldId),
}));

const mockGetLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
}));

const mockCheckRedisReachable = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRedisReachable: () => mockCheckRedisReachable(),
}));

const mockGetOrCreateMarketControls = vi.fn();
vi.mock("@/server/trading/repo", () => ({
  getOrCreateMarketControls: () => mockGetOrCreateMarketControls(),
}));

import { db } from "@/db/client";
import { DEFAULT_LESSON_FLOW_SCORING } from "@/server/settings/schemas";
import { GET } from "./route";

function publishedDoc(overrides: Partial<{ isPlaceholder: boolean }> = {}) {
  return { type: "terms", version: 1, isPlaceholder: false, ...overrides };
}

const STAFF = { id: "staff_1", clerkUserId: "clerk_staff_1", roleId: "role_1", active: true };

beforeEach(() => {
  mockGetStaffMember.mockReset().mockResolvedValue(STAFF);
  // Distinct staff/consumer hosts by default, so existing tests below don't
  // need to know about the Clerk-key check at all.
  mockEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkKey(STAFF_HOST);
  mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = clerkKey(CONSUMER_HOST);
  mockEnv.VERCEL_GIT_COMMIT_SHA = undefined;
  mockEnv.CONSENT_PII_HMAC_KEY = "test-hmac-key";
  mockEnv.RELAY_SHARED_SECRET = "test-relay-secret";
  mockEnv.S3_ENDPOINT = "https://xxx.supabase.co/storage/v1/s3";
  mockEnv.S3_REGION = "ap-south-1";
  mockEnv.S3_BUCKET = "finlamma";
  mockEnv.S3_ACCESS_KEY_ID = "test-key";
  mockEnv.S3_SECRET_ACCESS_KEY = "test-secret";
  // All three types published, none placeholder - existing tests below
  // don't need to know about the legalDocuments warning field at all.
  mockListPublishedDocuments.mockReset().mockResolvedValue([
    publishedDoc(),
    publishedDoc(),
    publishedDoc(),
  ]);
  // No published worlds by default - existing tests below don't need to
  // know about the worldsMissingBossQuiz warning field at all.
  mockListPublishedWorlds.mockReset().mockResolvedValue([]);
  mockListPublishedLessonsByWorldId.mockReset().mockResolvedValue([]);
  // Default position (3) - existing tests below don't need to know about
  // the tradingUnlockWorldMissing warning field at all.
  mockGetLessonFlowScoringSettings.mockReset().mockResolvedValue(DEFAULT_LESSON_FLOW_SCORING);
  // "ok" by default - existing tests below don't need to know about the
  // redis warning field at all.
  mockCheckRedisReachable.mockReset().mockResolvedValue("ok");
  // Configured by default - existing tests below don't need to know about
  // the inngest warning field at all.
  mockEnv.INNGEST_SIGNING_KEY = "test-signing-key";
  mockEnv.VERCEL_ENV = undefined;
  // Unset by default (auto-selects "mock") - existing tests below don't
  // need to know about the market warning field at all.
  mockEnv.TWELVEDATA_API_KEY = undefined;
  mockEnv.MARKET_DATA_PROVIDER = undefined;
  // No global halt by default - existing tests below don't need to know
  // about the tradingHalt warning field at all.
  mockGetOrCreateMarketControls.mockReset().mockResolvedValue({ globalHalt: false });
  // A real, non-localhost URL by default - existing tests below don't need
  // to know about the appUrl warning field at all.
  mockEnv.APP_URL = "https://finlamma-backend-rho.vercel.app";
  mockEnv.VERCEL_URL = undefined;
  mockEnv.VERCEL_PROJECT_PRODUCTION_URL = undefined;
  // checkMigrationsApplied's own db.execute call (the only one this route
  // makes directly against db - no separate "select 1" ping here, unlike
  // the public route) - a value bigger than any real timestamp, so tests
  // don't need to know the bundled journal's exact value.
  vi.mocked(db.execute).mockReset().mockResolvedValue([{ latest: String(Number.MAX_SAFE_INTEGER) }] as never);
});

describe("GET /api/v1/health/details", () => {
  it("returns 403 when there's no active staff account for this session (not signed in, or signed in without a staff row)", async () => {
    mockGetStaffMember.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("returns the full diagnostic payload for a signed-in staff member", async () => {
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
    expect(body.data.relaySecret).toBe("ok");
    expect(body.data.storage).toBe("ok");
    expect(body.data.market).toBe("mock");
    expect(body.data.tradingHalt).toBe("ok");
    expect(body.data.redis).toBe("ok");
    expect(body.data.worldsMissingBossQuiz).toEqual([]);
    expect(body.data.inngest).toBe("ok");
    expect(body.data.appUrl).toBe("ok");
    expect(typeof body.data.timestamp).toBe("string");
  });

  it("reports migrations: 'pending' as data, never a 503 - this endpoint never fails closed on it", async () => {
    vi.mocked(db.execute).mockResolvedValue([{ latest: "1" }] as never); // absurdly old/stale

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.migrations).toBe("pending");
  });

  it("reports clerkKeys: 'swapped' as data, never a 503", async () => {
    mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = clerkKey(STAFF_HOST); // same host as staff

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.clerkKeys).toBe("swapped");
  });

  it("lists a published world with no published Boss Quiz lesson, without failing the check", async () => {
    mockListPublishedWorlds.mockResolvedValue([
      { id: "world_1", title: { en: "Money World" } },
      { id: "world_2", title: { en: "Savings Valley" } },
    ]);
    mockListPublishedLessonsByWorldId.mockImplementation((worldId: string) =>
      Promise.resolve(
        worldId === "world_1" ? [{ kind: "boss_quiz" }, { kind: "video" }] : [{ kind: "video" }],
      ),
    );

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.worldsMissingBossQuiz).toEqual([{ id: "world_2", title: "Savings Valley" }]);
  });

  it("reports worldsMissingBossQuiz: [] when every published world has one", async () => {
    mockListPublishedWorlds.mockResolvedValue([{ id: "world_1", title: { en: "Money World" } }]);
    mockListPublishedLessonsByWorldId.mockResolvedValue([{ kind: "boss_quiz" }]);

    const res = await GET();

    expect((await res.json()).data.worldsMissingBossQuiz).toEqual([]);
  });

  it("reports worldsMissingBossQuiz: [] (not a 503) if the check itself throws", async () => {
    mockListPublishedWorlds.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.worldsMissingBossQuiz).toEqual([]);
  });

  it("reports legalDocuments: placeholder without failing the check, when a published document is seeded filler text", async () => {
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
    mockListPublishedDocuments.mockResolvedValue([publishedDoc(), publishedDoc()]); // only 2 of 3

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.legalDocuments).toBe("unpublished");
  });

  it("reports legalDocuments: unpublished (not a 503) if the check itself throws", async () => {
    mockListPublishedDocuments.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.legalDocuments).toBe("unpublished");
  });

  it("treats an unconfigured consumer Clerk key as a non-failing 'unconfigured' status", async () => {
    mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = undefined;

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.clerkKeys).toBe("unconfigured");
  });

  it("reports the deployed commit's short SHA as `version` when VERCEL_GIT_COMMIT_SHA is set", async () => {
    mockEnv.VERCEL_GIT_COMMIT_SHA = "2d303f6a1b2c3d4e5f60718293a4b5c6d7e8f9a0";

    const res = await GET();

    expect((await res.json()).data.version).toBe("2d303f6");
  });

  it("reports version: 'local' when VERCEL_GIT_COMMIT_SHA is unset (local dev, tests)", async () => {
    mockEnv.VERCEL_GIT_COMMIT_SHA = undefined;

    const res = await GET();

    expect((await res.json()).data.version).toBe("local");
  });

  it("reports consentPiiHmacKey: 'missing' (not a 503) when CONSENT_PII_HMAC_KEY isn't configured", async () => {
    mockEnv.CONSENT_PII_HMAC_KEY = undefined;

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.consentPiiHmacKey).toBe("missing");
  });

  it("reports relaySecret: 'missing' (not a 503) when RELAY_SHARED_SECRET isn't configured", async () => {
    mockEnv.RELAY_SHARED_SECRET = undefined;

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.relaySecret).toBe("missing");
  });

  it("reports tradingHalt: 'active' (not a 503) when market_controls.global_halt is on", async () => {
    mockGetOrCreateMarketControls.mockResolvedValueOnce({ globalHalt: true });

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.tradingHalt).toBe("active");
  });

  it("degrades tradingHalt to 'ok' (not a 503) if the check itself throws", async () => {
    mockGetOrCreateMarketControls.mockRejectedValueOnce(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.tradingHalt).toBe("ok");
  });

  it.each([
    ["S3_ENDPOINT"],
    ["S3_REGION"],
    ["S3_BUCKET"],
    ["S3_ACCESS_KEY_ID"],
    ["S3_SECRET_ACCESS_KEY"],
  ] as const)("reports storage: 'missing' (not a 503) when %s isn't configured", async (varName) => {
    mockEnv[varName] = undefined;

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.storage).toBe("missing");
  });

  it("reports storage: 'ok' when every S3_* var is configured", async () => {
    const res = await GET();

    expect((await res.json()).data.storage).toBe("ok");
  });

  describe("market", () => {
    it("reports 'mock' when no TWELVEDATA_API_KEY is configured and no override is set", async () => {
      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.market).toBe("mock");
    });

    it("reports 'configured' when TWELVEDATA_API_KEY is set", async () => {
      mockEnv.TWELVEDATA_API_KEY = "a-real-key";

      const res = await GET();

      expect((await res.json()).data.market).toBe("configured");
    });

    it("reports 'mock' when MARKET_DATA_PROVIDER=mock is explicitly set, even with a real key present", async () => {
      mockEnv.TWELVEDATA_API_KEY = "a-real-key";
      mockEnv.MARKET_DATA_PROVIDER = "mock";

      const res = await GET();

      expect((await res.json()).data.market).toBe("mock");
    });

    it("reports 'unconfigured' when MARKET_DATA_PROVIDER=twelvedata is explicitly set but no key is present", async () => {
      mockEnv.MARKET_DATA_PROVIDER = "twelvedata";

      const res = await GET();

      expect(res.status).toBe(200); // non-fatal, never a 503
      expect((await res.json()).data.market).toBe("unconfigured");
    });
  });

  describe("redis", () => {
    it("reports 'unconfigured' (not a 503) when Upstash env vars aren't set", async () => {
      mockCheckRedisReachable.mockResolvedValue("unconfigured");

      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.redis).toBe("unconfigured");
    });

    it("reports 'unreachable' (not a 503) when a live ping fails", async () => {
      mockCheckRedisReachable.mockResolvedValue("unreachable");

      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.redis).toBe("unreachable");
    });
  });

  describe("inngest", () => {
    it("reports 'unconfigured' on a Vercel deployment with no signing key", async () => {
      mockEnv.INNGEST_SIGNING_KEY = undefined;
      mockEnv.VERCEL_ENV = "production";

      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.inngest).toBe("unconfigured");
    });

    it("reports 'unconfigured' on a Vercel preview deployment with no signing key too", async () => {
      mockEnv.INNGEST_SIGNING_KEY = undefined;
      mockEnv.VERCEL_ENV = "preview";

      const res = await GET();

      expect((await res.json()).data.inngest).toBe("unconfigured");
    });

    it("reports 'ok' outside Vercel even without a signing key (local dev auto-detects Dev mode)", async () => {
      mockEnv.INNGEST_SIGNING_KEY = undefined;
      mockEnv.VERCEL_ENV = undefined;

      const res = await GET();

      expect((await res.json()).data.inngest).toBe("ok");
    });

    it("reports 'ok' on a Vercel deployment when INNGEST_SIGNING_KEY is set", async () => {
      mockEnv.INNGEST_SIGNING_KEY = "test-signing-key";
      mockEnv.VERCEL_ENV = "production";

      const res = await GET();

      expect((await res.json()).data.inngest).toBe("ok");
    });
  });

  describe("tradingUnlockWorldMissing", () => {
    it("reports true when fewer published worlds exist than the configured position", async () => {
      mockGetLessonFlowScoringSettings.mockResolvedValue({
        ...DEFAULT_LESSON_FLOW_SCORING,
        tradingUnlockAfterWorldPosition: 3,
      });
      mockListPublishedWorlds.mockResolvedValue([
        { id: "w1", title: { en: "World 1" } },
        { id: "w2", title: { en: "World 2" } },
      ]);

      const res = await GET();

      expect((await res.json()).data.tradingUnlockWorldMissing).toBe(true);
    });

    it("reports false once enough published worlds exist", async () => {
      mockGetLessonFlowScoringSettings.mockResolvedValue({
        ...DEFAULT_LESSON_FLOW_SCORING,
        tradingUnlockAfterWorldPosition: 3,
      });
      mockListPublishedWorlds.mockResolvedValue([
        { id: "w1", title: { en: "World 1" } },
        { id: "w2", title: { en: "World 2" } },
        { id: "w3", title: { en: "World 3" } },
      ]);

      const res = await GET();

      expect((await res.json()).data.tradingUnlockWorldMissing).toBe(false);
    });

    it("reports false (not a 503) if the check itself throws", async () => {
      mockGetLessonFlowScoringSettings.mockRejectedValue(new Error("boom"));

      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.tradingUnlockWorldMissing).toBe(false);
    });
  });

  describe("appUrl", () => {
    it("reports 'localhost' (not a 503) when APP_URL is still the local-dev placeholder", async () => {
      mockEnv.APP_URL = "http://localhost:3000";

      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.appUrl).toBe("localhost");
    });

    it("reports 'localhost' for the 127.0.0.1 form too", async () => {
      mockEnv.APP_URL = "http://127.0.0.1:3000";

      const res = await GET();

      expect((await res.json()).data.appUrl).toBe("localhost");
    });

    it("reports 'empty' (not a 503) when APP_URL can't be parsed to a hostname at all", async () => {
      mockEnv.APP_URL = "not-a-url";

      const res = await GET();

      expect(res.status).toBe(200);
      expect((await res.json()).data.appUrl).toBe("empty");
    });

    it("reports 'ok' outside Vercel even with no expected host to compare against", async () => {
      mockEnv.APP_URL = "https://finlamma-backend-rho.vercel.app";
      mockEnv.VERCEL_ENV = undefined;

      const res = await GET();

      expect((await res.json()).data.appUrl).toBe("ok");
    });

    it("reports 'mismatched_host' in production when APP_URL's host doesn't match VERCEL_PROJECT_PRODUCTION_URL", async () => {
      mockEnv.VERCEL_ENV = "production";
      mockEnv.VERCEL_PROJECT_PRODUCTION_URL = "finlamma-backend-rho.vercel.app";
      mockEnv.APP_URL = "https://some-stale-custom-domain.example.com";

      const res = await GET();

      expect(res.status).toBe(200); // non-fatal, never a 503
      expect((await res.json()).data.appUrl).toBe("mismatched_host");
    });

    it("reports 'ok' in production when APP_URL's host matches VERCEL_PROJECT_PRODUCTION_URL", async () => {
      mockEnv.VERCEL_ENV = "production";
      mockEnv.VERCEL_PROJECT_PRODUCTION_URL = "finlamma-backend-rho.vercel.app";
      mockEnv.APP_URL = "https://finlamma-backend-rho.vercel.app";

      const res = await GET();

      expect((await res.json()).data.appUrl).toBe("ok");
    });

    it("compares against VERCEL_URL (not VERCEL_PROJECT_PRODUCTION_URL) on a preview deployment", async () => {
      mockEnv.VERCEL_ENV = "preview";
      mockEnv.VERCEL_URL = "finlamma-backend-git-feature-abc123.vercel.app";
      mockEnv.APP_URL = "https://finlamma-backend-rho.vercel.app"; // production's own URL, wrong for this preview

      const res = await GET();

      expect((await res.json()).data.appUrl).toBe("mismatched_host");
    });

    it("fails open to 'ok' on Vercel when the expected host itself isn't available to compare against", async () => {
      mockEnv.VERCEL_ENV = "production";
      mockEnv.VERCEL_PROJECT_PRODUCTION_URL = undefined;
      mockEnv.APP_URL = "https://finlamma-backend-rho.vercel.app";

      const res = await GET();

      expect((await res.json()).data.appUrl).toBe("ok");
    });
  });
});
