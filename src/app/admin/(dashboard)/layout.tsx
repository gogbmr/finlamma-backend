import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { getStaffMember } from "@/lib/auth";
import { getRoleById, roleHasPermission } from "@/server/staff/repo";
import { getMarketControls } from "@/server/trading/service";
import { AdminNavStrip, AdminSidebar, type AdminNavVisibility } from "@/components/admin/admin-nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffMember();

  if (!staff) {
    // Distinguish "not signed in" (send to sign-in) from "signed in but not
    // an active staff member" (would loop back here if redirected to
    // sign-in) - only check auth() again in this rarer branch.
    const { userId } = await auth();
    if (!userId) redirect("/admin/sign-in");

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account isn&apos;t set up as an active staff member yet. Ask a super admin to
            add you.
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
  // permission server-side regardless of what's rendered.
  const [
    worldManage, worldPublish,
    lessonManage, lessonPublish,
    questionManage, questionPublish,
    mentorManage, mentorPublish,
    consentView,
    staffManage,
    activityLogView,
    legalManage,
    settingsManage,
    economyManage,
    coachNoteManage,
    coachNotePublish,
    instrumentManage,
    tradingOps,
    role,
  ] = await Promise.all([
    roleHasPermission(staff.roleId, "world.manage"),
    roleHasPermission(staff.roleId, "world.publish"),
    roleHasPermission(staff.roleId, "lesson.manage"),
    roleHasPermission(staff.roleId, "lesson.publish"),
    roleHasPermission(staff.roleId, "question.manage"),
    roleHasPermission(staff.roleId, "question.publish"),
    roleHasPermission(staff.roleId, "mentor.manage"),
    roleHasPermission(staff.roleId, "mentor.publish"),
    roleHasPermission(staff.roleId, "consent.view"),
    roleHasPermission(staff.roleId, "staff.manage"),
    roleHasPermission(staff.roleId, "activity_log.view"),
    roleHasPermission(staff.roleId, "legal.manage"),
    roleHasPermission(staff.roleId, "settings.manage"),
    roleHasPermission(staff.roleId, "economy.manage"),
    roleHasPermission(staff.roleId, "coach_note.manage"),
    roleHasPermission(staff.roleId, "coach_note.publish"),
    roleHasPermission(staff.roleId, "instrument.manage"),
    roleHasPermission(staff.roleId, "trading.ops"),
    getRoleById(staff.roleId),
  ]);

  const visibility: AdminNavVisibility = {
    worlds: worldManage || worldPublish,
    lessons: lessonManage || lessonPublish,
    questions: questionManage || questionPublish,
    mentors: mentorManage || mentorPublish,
    consent: consentView,
    staff: staffManage,
    activityLog: activityLogView,
    legal: legalManage,
    settings: settingsManage,
    badges: economyManage,
    rewards: economyManage,
    coachNotes: coachNoteManage || coachNotePublish,
    instruments: instrumentManage,
    opsConsole: tradingOps,
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
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-card px-4 py-6 lg:flex lg:flex-col">
          <div className="mb-6 flex items-center gap-2 px-3">
            <span className="text-lg font-bold text-brand-violet-900">FinLamma</span>
            <span className="text-xs font-medium text-muted-foreground">Admin</span>
          </div>
          <AdminSidebar visibility={visibility} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 lg:px-6">
            <span className="text-base font-bold text-brand-violet-900 lg:hidden">FinLamma</span>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="font-mono text-xs text-foreground">{staff.clerkUserId}</p>
                <p className="text-xs text-muted-foreground">{role?.name ?? "Staff"}</p>
              </div>
              <UserButton />
            </div>
          </header>
          <AdminNavStrip visibility={visibility} />
          {globalHalt && (
            <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-semibold text-destructive-foreground">
              GLOBAL TRADING HALT ACTIVE — no learner can place an order right now.
              {visibility.opsConsole && (
                <Link href="/admin/ops" className="underline underline-offset-2">
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
