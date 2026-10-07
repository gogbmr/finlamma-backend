import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { getStaffMember } from "@/lib/auth";
import { withTimingAndTimeout } from "@/lib/admin-diagnostics";
import { getPermissionKeysForRole, getRoleById } from "@/server/staff/repo";
import { getMarketControls } from "@/server/trading/service";
import {
  AdminNavStrip,
  AdminSidebar,
  type AdminNavVisibility,
} from "@/components/admin/admin-nav";

// See src/lib/admin-diagnostics.ts for the full context on why this exists.
// Confirmed 2026-10-06: both calls below resolve in ~6s total (1.4s +
// 4.5s) - the shell itself is NOT the hang. Kept instrumented anyway (cheap,
// and rules the shell back out on every future occurrence too) while the
// hang is chased further down into each page's own data fetches.
const ADMIN_SHELL_TIMEOUT_MS = 15_000;

// A thrown error here is NOT caught by ./error.tsx - Next.js error
// boundaries never catch an error thrown by the layout.tsx in their own
// route segment, only by page.tsx/nested layouts below it (confirmed
// against this Next version's own docs,
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md: "It does not wrap the layout.js ... above it in the same
// segment"). There's no admin-level or root error.tsx/global-error.tsx
// either, so an uncaught throw here would fall through to Next's generic
// default error page - diagnosable only from server logs, not from what
// staff actually see. Caught explicitly below instead, so a timeout/auth
// failure renders a clear, dedicated panel - deliberately NOT the sidebar/
// visibility render path, so there is no way to reach a half-permissioned
// admin shell.
function AdminShellFailure({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-foreground text-lg font-semibold">
          Admin couldn&apos;t load
        </h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        <p className="text-muted-foreground text-xs">
          Refresh to try again. If this keeps happening, check the server logs
          for [admin-shell] timing entries - see docs/STATUS.md.
        </p>
      </div>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  let staff: Awaited<ReturnType<typeof getStaffMember>>;
  try {
    staff = await withTimingAndTimeout(
      "getStaffMember (auth())",
      getStaffMember(),
      ADMIN_SHELL_TIMEOUT_MS,
    );
  } catch (err) {
    return <AdminShellFailure error={err} />;
  }

  if (!staff) {
    // Distinguish "not signed in" (send to sign-in) from "signed in but not
    // an active staff member" (would loop back here if redirected to
    // sign-in) - only check auth() again in this rarer branch.
    const { userId } = await auth();
    if (!userId) redirect("/admin/sign-in");

    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-foreground text-lg font-semibold">
            Access denied
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your account isn&apos;t set up as an active staff member yet. Ask a
            super admin to add you.
          </p>
          <div className="mt-4 flex justify-center">
            <UserButton />
          </div>
        </div>
      </div>
    );
  }

  // Mirrors each page's own requireStaff()/roleHasPermission() gate, purely
  // to decide what to show in the nav - hiding a link here never grants
  // access, and every page still independently re-checks the same
  // permission server-side regardless of what's rendered. Caught the same
  // way as the staff lookup above, for the same reason: a timeout/rejection
  // here must never fall through to a sidebar render with some permissions
  // resolved and others missing - it renders the dedicated failure panel
  // instead, never the nav/visibility JSX below.
  //
  // Used to be 22 separate roleHasPermission() round trips (even batched
  // through runWithConcurrencyLimit, still 22 round trips - 4.5s even when
  // it worked, and still capable of tripping the transaction-pooler
  // pipelining hang under cross-request pool contention on a warm
  // instance, which is what actually happened in production after the
  // limiter shipped - docs/ARCHITECTURE.md D72's follow-up). The
  // concurrency limiter was pacing a design that shouldn't have existed:
  // one query (getPermissionKeysForRole) returns every permission key the
  // role holds, and getRoleById runs alongside it - 2 queries total,
  // comfortably under max: 4 with no limiter needed at all.
  let grantedKeys: Set<string>;
  let role: Awaited<ReturnType<typeof getRoleById>>;
  try {
    [grantedKeys, role] = await withTimingAndTimeout(
      "permission keys + role (2 queries, was 23)",
      Promise.all([
        getPermissionKeysForRole(staff.roleId),
        getRoleById(staff.roleId),
      ]),
      ADMIN_SHELL_TIMEOUT_MS,
    );
  } catch (err) {
    return <AdminShellFailure error={err} />;
  }

  const visibility: AdminNavVisibility = {
    worlds: grantedKeys.has("world.manage") || grantedKeys.has("world.publish"),
    lessons:
      grantedKeys.has("lesson.manage") || grantedKeys.has("lesson.publish"),
    questions:
      grantedKeys.has("question.manage") || grantedKeys.has("question.publish"),
    mentors:
      grantedKeys.has("mentor.manage") || grantedKeys.has("mentor.publish"),
    consent: grantedKeys.has("consent.view"),
    doubtZoneModeration: grantedKeys.has("doubt_zone.moderate"),
    staff: grantedKeys.has("staff.manage"),
    activityLog: grantedKeys.has("activity_log.view"),
    legal: grantedKeys.has("legal.manage"),
    settings: grantedKeys.has("settings.manage"),
    badges: grantedKeys.has("economy.manage"),
    rewards: grantedKeys.has("economy.manage"),
    competitions: grantedKeys.has("economy.manage"),
    coachNotes:
      grantedKeys.has("coach_note.manage") ||
      grantedKeys.has("coach_note.publish"),
    instruments: grantedKeys.has("instrument.manage"),
    opsConsole: grantedKeys.has("trading.ops"),
    newsDesk: grantedKeys.has("news.manage") || grantedKeys.has("news.publish"),
    analytics: grantedKeys.has("analytics.view"),
  };

  // Persistent halt banner (docs/ARCHITECTURE.md D47, founder's requirement
  // 2: "make it obvious in the UI when a halt is active"). Shown on EVERY
  // admin page, not just the Ops console itself, and to every staff member
  // who can see the admin shell at all - a halt affects every learner, so
  // hiding it from staff without trading.ops would be exactly the kind of
  // "silent" halt the founder asked to rule out. Fails safe (banner just
  // doesn't render) rather than breaking the ENTIRE admin shell if this one
  // read has a transient problem - every other admin page has nothing to do
  // with trading and shouldn't become unreachable because of it. A stuck
  // halt is still independently surfaced by GET /api/v1/health's
  // tradingHalt field regardless of whether this particular read succeeds.
  const globalHalt = await getMarketControls()
    .then((controls) => controls.globalHalt)
    .catch(() => false);

  return (
    <div className="bg-background min-h-screen">
      <Toaster richColors position="top-right" />
      <div className="flex min-h-screen">
        <aside className="border-border bg-card hidden w-60 shrink-0 border-r px-4 py-6 lg:flex lg:flex-col">
          <div className="mb-6 flex items-center gap-2 px-3">
            <span className="text-brand-violet-900 text-lg font-bold">
              FinLamma
            </span>
            <span className="text-muted-foreground text-xs font-medium">
              Admin
            </span>
          </div>
          <AdminSidebar visibility={visibility} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border bg-card flex items-center justify-between gap-4 border-b px-4 py-3 lg:px-6">
            <span className="text-brand-violet-900 text-base font-bold lg:hidden">
              FinLamma
            </span>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-foreground font-mono text-xs">
                  {staff.clerkUserId}
                </p>
                <p className="text-muted-foreground text-xs">
                  {role?.name ?? "Staff"}
                </p>
              </div>
              <UserButton />
            </div>
          </header>
          <AdminNavStrip visibility={visibility} />
          {globalHalt && (
            <div className="bg-destructive text-destructive-foreground flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold">
              GLOBAL TRADING HALT ACTIVE — no learner can place an order right
              now.
              {visibility.opsConsole && (
                <Link
                  href="/admin/ops"
                  className="underline underline-offset-2"
                >
                  Resolve in Ops Console
                </Link>
              )}
            </div>
          )}
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
