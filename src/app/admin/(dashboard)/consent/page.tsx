import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getConsentReviewList } from "@/server/onboarding/service";
import { ConsentReviewTable } from "./consent-review-table";
import { DobCorrectionForm } from "./dob-correction-form";

export default async function ConsentReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDeleted?: string }>;
}) {
  let staff;
  try {
    staff = await requireStaff("consent.view");
  } catch {
    return <Forbidden message="You don't have permission to view parental consent status." />;
  }

  const params = await searchParams;
  const includeDeleted = params.includeDeleted === "1";

  // consent.correct_dob is super_admin only (app asks batch, section C3) -
  // hidden here for everyone else, but the server action re-checks it
  // itself regardless (admin-page skill rule 2: never rely on hiding alone).
  const canCorrectDob = await roleHasPermission(staff.roleId, "consent.correct_dob");

  const rows = await getConsentReviewList(100, includeDeleted);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Consent" }]}
        icon={ShieldCheck}
        title="Parental consent"
        description="Read-only status for every under-18 account's parental-consent request. This view cannot approve, deny or bypass consent - only the parent can, via their emailed link. Parent contact details are hidden by default; viewing them is logged. Deleted accounts are hidden by default and their contact details are never revealable."
      />

      <Link
        href={includeDeleted ? "/admin/consent" : "/admin/consent?includeDeleted=1"}
        className="text-sm font-medium underline"
      >
        {includeDeleted ? "Hide deleted accounts" : "Show deleted accounts"}
      </Link>

      {canCorrectDob && <DobCorrectionForm />}

      <ConsentReviewTable
        rows={rows.map((r) => ({
          userId: r.userId,
          displayName: r.lastInitial ? `${r.firstName ?? "—"} ${r.lastInitial}.` : (r.firstName ?? "—"),
          status: r.status,
          requestedAt: r.createdAt.toISOString(),
          actedAt: r.actedAt ? r.actedAt.toISOString() : null,
          deleted: r.deletedAt !== null,
        }))}
      />
    </div>
  );
}
