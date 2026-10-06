import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { getStaffMember } from "@/lib/auth";
import { withTimingAndTimeout } from "@/lib/admin-diagnostics";
import {
  DB_CONCURRENCY_LIMIT,
  runWithConcurrencyLimit,
} from "@/lib/concurrency-limit";
import { getRoleById, roleHasPermission } from "@/server/staff/repo";
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
  // Declared outside the try (not a tuple type on a temp variable - a
  // hand-counted tuple is exactly the kind of off-by-one this invites, and
  // in fact did on the first pass here) so the destructuring assignment
  // below is the only place element count/order has to match the
  // Promise.all array, self-checked by the compiler against these 22
  // booleans + role.
  let worldManage: boolean, worldPublish: boolean;
  let lessonManage: boolean, lessonPublish: boolean;
  let questionManage: boolean, questionPublish: boolean;
  let mentorManage: boolean, mentorPublish: boolean;
  let consentView: boolean;
  let doubtZoneModerate: boolean;
  let staffManage: boolean;
  let activityLogView: boolean;
  let legalManage: boolean;
  let settingsManage: boolean;
  let economyManage: boolean;
  let coachNoteManage: boolean, coachNotePublish: boolean;
  let instrumentManage: boolean;
  let tradingOps: boolean;
  let newsManage: boolean, newsPublish: boolean;
  let analyticsView: boolean;
  let role: Awaited<ReturnType<typeof getRoleById>>;

  try {
    [
      worldManage,
      worldPublish,
      lessonManage,
      lessonPublish,
      questionManage,
      questionPublish,
      mentorManage,
      mentorPublish,
      consentView,
      doubtZoneModerate,
      staffManage,
      activityLogView,
      legalManage,
      settingsManage,
      economyManage,
      coachNoteManage,
      coachNotePublish,
      instrumentManage,
      tradingOps,
      newsManage,
      newsPublish,
      analyticsView,
      role,
    ] = await withTimingAndTimeout(
      "permission Promise.all (22 roleHasPermission + getRoleById)",
      // D13/D72 (docs/ARCHITECTURE.md): 23 truly concurrent queries against
      // a max: 4 pool would wedge a connection the same way the worlds-page
      // incident did - runWithConcurrencyLimit caps this at DB_CONCURRENCY_LIMIT
      // instead of a bare Promise.all.
      runWithConcurrencyLimit(
        [
          () => roleHasPermission(staff.roleId, "world.manage"),
          () => roleHasPermission(staff.roleId, "world.publish"),
          () => roleHasPermission(staff.roleId, "lesson.manage"),
          () => roleHasPermission(staff.roleId, "lesson.publish"),
          () => roleHasPermission(staff.roleId, "question.manage"),
          () => roleHasPermission(staff.roleId, "question.publish"),
          () => roleHasPermission(staff.roleId, "mentor.manage"),
          () => roleHasPermission(staff.roleId, "mentor.publish"),
          () => roleHasPermission(staff.roleId, "consent.view"),
          () => roleHasPermission(staff.roleId, "doubt_zone.moderate"),
          () => roleHasPermission(staff.roleId, "staff.manage"),
          () => roleHasPermission(staff.roleId, "activity_log.view"),
          () => roleHasPermission(staff.roleId, "legal.manage"),
          () => roleHasPermission(staff.roleId, "settings.manage"),
          () => roleHasPermission(staff.roleId, "economy.manage"),
          () => roleHasPermission(staff.roleId, "coach_note.manage"),
          () => roleHasPermission(staff.roleId, "coach_note.publish"),
          () => roleHasPermission(staff.roleId, "instrument.manage"),
          () => roleHasPermission(staff.roleId, "trading.ops"),
          () => roleHasPermission(staff.roleId, "news.manage"),
          () => roleHasPermission(staff.roleId, "news.publish"),
          () => roleHasPermission(staff.roleId, "analytics.view"),
          () => getRoleById(staff.roleId),
        ],
        DB_CONCURRENCY_LIMIT,
      ),
      ADMIN_SHELL_TIMEOUT_MS,
    );
  } catch (err) {
    return <AdminShellFailure error={err} />;
  }

  const visibility: AdminNavVisibility = {
    worlds: worldManage || worldPublish,
    lessons: lessonManage || lessonPublish,
    questions: questionManage || questionPublish,
    mentors: mentorManage || mentorPublish,
    consent: consentView,
    doubtZoneModeration: doubtZoneModerate,
    staff: staffManage,
    activityLog: activityLogView,
    legal: legalManage,
    settings: settingsManage,
    badges: economyManage,
    rewards: economyManage,
    competitions: economyManage,
    coachNotes: coachNoteManage || coachNotePublish,
    instruments: instrumentManage,
    opsConsole: tradingOps,
    newsDesk: newsManage || newsPublish,
    analytics: analyticsView,
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
