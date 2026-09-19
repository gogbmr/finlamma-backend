import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  CONSUMER_CLERK_SECRET_KEY: "sk_test_consumer" as string | undefined,
  CONSUMER_CLERK_PUBLISHABLE_KEY: "pk_test_consumer" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockAuthenticateRequest = vi.fn();
const mockCreateClerkClient = vi.fn((options: unknown) => ({
  authenticateRequest: mockAuthenticateRequest,
  __options: options,
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: (options: unknown) => mockCreateClerkClient(options),
}));

// Generic chainable query mock: every intermediate method (from/where/
// innerJoin) returns the same chain, and .limit() is the only terminal -
// this covers both requireUser's select().from().where().limit() and
// requireStaff's select().from().innerJoin().where().limit(). Each call to
// mockLimit() is queued in call order via mockResolvedValueOnce.
const mockLimit = vi.fn();
function queryChain(): unknown {
  return {
    from: () => queryChain(),
    where: () => queryChain(),
    innerJoin: () => queryChain(),
    limit: () => mockLimit(),
  };
}
vi.mock("@/db/client", () => ({
  db: {
    select: () => queryChain(),
  },
}));

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

import { getStaffMember, requireStaff, requireUser } from "./auth";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/me", { headers });
}

function authenticated(userId: string) {
  return { isAuthenticated: true, status: "signed-in", toAuth: () => ({ userId }) };
}

function unauthenticated(status: "signed-out" | "handshake" = "signed-out") {
  return { isAuthenticated: false, status, toAuth: () => ({ userId: null }) };
}

describe("requireUser", () => {
  beforeEach(() => {
    mockEnv.CONSUMER_CLERK_SECRET_KEY = "sk_test_consumer";
    mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = "pk_test_consumer";
    mockAuthenticateRequest.mockReset();
    mockCreateClerkClient.mockClear();
    mockLimit.mockReset();
    mockAuth.mockReset();
  });

  it("throws SERVICE_UNAVAILABLE when the consumer Clerk app isn't configured yet", async () => {
    mockEnv.CONSUMER_CLERK_SECRET_KEY = undefined;
    mockEnv.CONSUMER_CLERK_PUBLISHABLE_KEY = undefined;

    await expect(requireUser(makeRequest())).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(mockAuthenticateRequest).not.toHaveBeenCalled();
  });

  it("throws UNAUTHENTICATED when there is no bearer token", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(unauthenticated("signed-out"));

    await expect(requireUser(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("throws UNAUTHENTICATED for an expired or otherwise invalid token", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(unauthenticated("signed-out"));

    await expect(
      requireUser(makeRequest({ Authorization: "Bearer expired.token.here" })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("throws UNAUTHENTICATED for a token issued by a different Clerk instance (e.g. a staff token)", async () => {
    // A staff-app token fails signature verification against the consumer
    // app's own JWKS (different Clerk applications sign with different
    // keys/issuers) - Clerk's SDK surfaces that the same way as any other
    // invalid token: isAuthenticated: false. requireUser must not treat
    // that as anything other than unauthenticated.
    mockAuthenticateRequest.mockResolvedValueOnce(unauthenticated("signed-out"));

    await expect(
      requireUser(makeRequest({ Authorization: "Bearer staff.instance.token" })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("treats a 'handshake' status as unauthenticated (no browser to redirect here)", async () => {
    // Clerk's own RequestState type only ever pairs status: 'handshake'
    // with isAuthenticated: false (it's a browser cookie-refresh signal,
    // meaningless for a Bearer-only mobile request with no cookie to
    // refresh) - so the plain isAuthenticated check below already covers
    // it. This test pins that down at the behavioral level.
    mockAuthenticateRequest.mockResolvedValueOnce(unauthenticated("handshake"));

    await expect(requireUser(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("throws SERVICE_UNAVAILABLE (without leaking the raw error) if verification throws unexpectedly", async () => {
    mockAuthenticateRequest.mockRejectedValueOnce(new Error("JWKS fetch failed"));

    await expect(requireUser(makeRequest())).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("throws UNAUTHENTICATED when the token is valid but no users row exists", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticated("clerk_123"));
    mockLimit.mockResolvedValueOnce([]);

    await expect(requireUser(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("throws UNAUTHENTICATED when the matching user is soft-deleted", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticated("clerk_123"));
    mockLimit.mockResolvedValueOnce([
      { id: "u1", clerkUserId: "clerk_123", deletedAt: new Date() },
    ]);

    await expect(requireUser(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("returns the users row when the token matches an active user", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce(authenticated("clerk_123"));
    mockLimit.mockResolvedValueOnce([
      { id: "u1", clerkUserId: "clerk_123", deletedAt: null },
    ]);

    const user = await requireUser(makeRequest());

    expect(user).toEqual({ id: "u1", clerkUserId: "clerk_123", deletedAt: null });
  });
});

describe("requireStaff", () => {
  beforeEach(() => {
    mockLimit.mockReset();
    mockAuth.mockReset();
  });

  it("throws UNAUTHENTICATED when there is no staff Clerk session", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });

    await expect(requireStaff("staff.manage")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when there is no staff_members row for this Clerk user", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    mockLimit.mockResolvedValueOnce([]);

    await expect(requireStaff("staff.manage")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN when the staff_members row is deactivated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    mockLimit.mockResolvedValueOnce([
      { id: "s1", clerkUserId: "staff_clerk_1", roleId: "r1", active: false },
    ]);

    await expect(requireStaff("staff.manage")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN when the staff member's role lacks the permission", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    mockLimit
      .mockResolvedValueOnce([
        { id: "s1", clerkUserId: "staff_clerk_1", roleId: "r1", active: true },
      ])
      .mockResolvedValueOnce([]);

    await expect(requireStaff("staff.manage")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns the staff_members row when the role grants the permission", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    const staff = { id: "s1", clerkUserId: "staff_clerk_1", roleId: "r1", active: true };
    mockLimit
      .mockResolvedValueOnce([staff])
      .mockResolvedValueOnce([{ id: "rp1" }]);

    const result = await requireStaff("staff.manage");

    expect(result).toEqual(staff);
  });
});

describe("getStaffMember", () => {
  beforeEach(() => {
    mockLimit.mockReset();
    mockAuth.mockReset();
  });

  it("returns null when there is no staff Clerk session", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });

    const result = await getStaffMember();

    expect(result).toBeNull();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("returns null when there is no matching staff_members row", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    mockLimit.mockResolvedValueOnce([]);

    expect(await getStaffMember()).toBeNull();
  });

  it("returns null when the staff_members row is deactivated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    mockLimit.mockResolvedValueOnce([
      { id: "s1", clerkUserId: "staff_clerk_1", roleId: "r1", active: false },
    ]);

    expect(await getStaffMember()).toBeNull();
  });

  it("returns the staff_members row when active", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "staff_clerk_1" });
    const staff = { id: "s1", clerkUserId: "staff_clerk_1", roleId: "r1", active: true };
    mockLimit.mockResolvedValueOnce([staff]);

    expect(await getStaffMember()).toEqual(staff);
  });
});
