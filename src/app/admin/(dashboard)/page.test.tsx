// AdminHomePage is a Server Component that only ever calls redirect() - same
// pattern src/app/admin/(dashboard)/worlds/page.test.tsx already uses for a
// Server Component that doesn't render to a DOM. Covers the exact question
// of what happens to a staff member whose role grants NO visible admin
// section at all: it must fall back to a page that renders Forbidden, never
// loop or throw.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real next/navigation redirect() throws a special signal so nothing after
// it ever runs - this mock does the same (a bare vi.fn() that just records
// the call and returns would let AdminHomePage's code after redirect()
// keep executing, which doesn't happen for real and crashed this test on
// `staff.roleId` when staff was null).
const mockRedirect = vi.fn((path: unknown) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: unknown) => mockRedirect(path) }));

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockGetPermissionKeysForRole = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
}));

import AdminHomePage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminHomePage", () => {
  it("redirects to sign-in when there's no active staff session", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    await expect(AdminHomePage()).rejects.toThrow();

    expect(mockRedirect).toHaveBeenCalledWith("/admin/sign-in");
  });

  it("lands on analytics when the role can see it", async () => {
    mockGetStaffMember.mockResolvedValue(STAFF);
    mockGetPermissionKeysForRole.mockResolvedValue(new Set(["analytics.view"]));

    await expect(AdminHomePage()).rejects.toThrow();

    expect(mockRedirect).toHaveBeenCalledWith("/admin/analytics");
  });

  it("falls through to the first visible section in priority order when analytics isn't granted", async () => {
    mockGetStaffMember.mockResolvedValue(STAFF);
    mockGetPermissionKeysForRole.mockResolvedValue(new Set(["mentor.publish"]));

    await expect(AdminHomePage()).rejects.toThrow();

    expect(mockRedirect).toHaveBeenCalledWith("/admin/mentors");
  });

  // The actual question this round asked: a role with zero visible
  // sections must still land somewhere that renders Forbidden, not loop or
  // crash - /admin/staff's own page.tsx shows Forbidden for staff.manage,
  // which this role also lacks by construction (an empty permission set).
  it("falls back to /admin/staff when the role has no visible sections at all", async () => {
    mockGetStaffMember.mockResolvedValue(STAFF);
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    await expect(AdminHomePage()).rejects.toThrow();

    expect(mockRedirect).toHaveBeenCalledWith("/admin/staff");
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});
