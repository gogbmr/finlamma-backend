import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { getStaffMember } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffMember();

  if (!staff) {
    // Distinguish "not signed in" (send to sign-in) from "signed in but not
    // an active staff member" (would loop back here if redirected to
    // sign-in) - only check auth() again in this rarer branch.
    const { userId } = await auth();
    if (!userId) redirect("/admin/sign-in");

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-neutral-600">
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

  return (
    <div className="flex min-h-screen">
      <Toaster richColors position="top-right" />
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 p-4">
        <div className="mb-6 text-lg font-semibold">Finlamma Admin</div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/admin/staff" className="rounded-md px-3 py-2 hover:bg-neutral-200">
            Staff
          </Link>
          <Link href="/admin/activity-log" className="rounded-md px-3 py-2 hover:bg-neutral-200">
            Activity Log
          </Link>
          <Link href="/admin/legal" className="rounded-md px-3 py-2 hover:bg-neutral-200">
            Legal
          </Link>
          <Link href="/admin/mentors" className="rounded-md px-3 py-2 hover:bg-neutral-200">
            Mentors
          </Link>
          <Link href="/admin/worlds" className="rounded-md px-3 py-2 hover:bg-neutral-200">
            Worlds
          </Link>
          <Link href="/admin/consent" className="rounded-md px-3 py-2 hover:bg-neutral-200">
            Consent
          </Link>
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-end border-b border-neutral-200 px-6 py-3">
          <UserButton />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
