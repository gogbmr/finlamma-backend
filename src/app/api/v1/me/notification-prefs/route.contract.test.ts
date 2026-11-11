// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the REAL wire shape this route returns, including the
// envelope (or lack of one), for a learner with no notification_prefs row
// and no "notifications" settings_kv row. This is the one gap the unit
// tests (route.test.ts, service.test.ts, settings.test.ts) all leave open:
// they mock the service/settings layer, so none of them ever exercise the
// real end-to-end resolution through to the actual JSON the app receives.
//
// Context: docs/API_ENDPOINTS.md documents this endpoint's 200 response
// FLAT ({ enabled, quietHours, disabledCategories }), with no { data: ... }
// envelope - unlike almost every other endpoint. The mobile app was built
// against that documented (flat) shape. This test locks the route to it.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsKv, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

// Never actually sends a push in this test - only the GET/PATCH response
// shape is under test here. Mocked the same way service.test.ts mocks it,
// so importing the route doesn't require real push-provider env vars.
vi.mock("@/server/notifications/provider", () => ({
  getPushProvider: () => ({ send: async () => [] }),
}));

const { db } = (await import("@/db/client")) as unknown as { db: TestDb };
const { GET, PATCH } = await import("./route");

afterAll(async () => {
  await db.$client.close();
});

beforeEach(() => {
  mockRequireFullAccess.mockResolvedValue(undefined);
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("notification-prefs-contract-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

function getRequest() {
  return new Request("http://localhost/api/v1/me/notification-prefs");
}
function patchRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/notification-prefs", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("GET/PATCH /api/v1/me/notification-prefs - real wire shape", () => {
  it("GET returns the documented FLAT shape (no { data } envelope) when no prefs row and no settings_kv row exist", async () => {
    const user = await makeUser();
    mockRequireUser.mockResolvedValueOnce(user);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      quietHours: { startHourIst: 21, endHourIst: 7 },
      disabledCategories: [],
    });
  });

  it("PATCH returns the same flat shape after an update", async () => {
    const user = await makeUser();
    mockRequireUser.mockResolvedValueOnce(user);

    const res = await PATCH(patchRequest({ enabled: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      enabled: false,
      quietHours: { startHourIst: 21, endHourIst: 7 },
      disabledCategories: [],
    });
  });

  it("GET resolves to the global settings_kv default when a custom one is seeded", async () => {
    const user = await makeUser();
    await db
      .insert(settingsKv)
      .values({
        key: "notifications",
        value: { defaultQuietHours: { startHourIst: 22, endHourIst: 6 }, retentionDays: 14 },
      })
      .onConflictDoNothing();
    mockRequireUser.mockResolvedValueOnce(user);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(body.quietHours).toEqual({ startHourIst: 22, endHourIst: 6 });
  });
});
