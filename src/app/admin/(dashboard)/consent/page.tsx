import { Forbidden } from "@/components/admin/forbidden";
import { requireStaff } from "@/lib/auth";
import { getConsentReviewList } from "@/server/onboarding/service";
import { ConsentReviewTable } from "./consent-review-table";

export default async function ConsentReviewPage() {
  try {
    await requireStaff("consent.view");
  } catch {
    return <Forbidden message="You don't have permission to view parental consent status." />;
  }

  const rows = await getConsentReviewList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Parental consent</h1>
        <p className="text-sm text-neutral-600">
          Read-only status for every under-18 account&apos;s parental-consent request. This view
          cannot approve, deny or bypass consent - only the parent can, via their emailed link.
          Parent contact details are hidden by default; viewing them is logged.
        </p>
      </div>

      <ConsentReviewTable
        rows={rows.map((r) => ({
          userId: r.userId,
          displayName: r.lastInitial ? `${r.firstName ?? "—"} ${r.lastInitial}.` : (r.firstName ?? "—"),
          status: r.status,
          requestedAt: r.createdAt.toISOString(),
          actedAt: r.actedAt ? r.actedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
