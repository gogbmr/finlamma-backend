import Link from "next/link";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { getConsentReviewList } from "@/server/onboarding/service";
import { ConsentReviewTable } from "./consent-review-table";

export default async function ConsentReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ includeDeleted?: string }>;
}) {
  try {
    await requireStaff("consent.view");
  } catch {
    return <Forbidden message="You don't have permission to view parental consent status." />;
  }

  const params = await searchParams;
  const includeDeleted = params.includeDeleted === "1";

  const rows = await getConsentReviewList(100, includeDeleted);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Consent" }]}
        title="Parental consent"
        description="Read-only status for every under-18 account's parental-consent request. This view cannot approve, deny or bypass consent - only the parent can, via their emailed link. Parent contact details are hidden by default; viewing them is logged. Deleted accounts are hidden by default and their contact details are never revealable."
      />

      <Link
        href={includeDeleted ? "/admin/consent" : "/admin/consent?includeDeleted=1"}
        className="text-sm font-medium underline"
      >
        {includeDeleted ? "Hide deleted accounts" : "Show deleted accounts"}
      </Link>

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
