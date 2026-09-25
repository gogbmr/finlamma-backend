import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getInstrumentEditorData, getMarketHolidayEditorData } from "@/server/trading/service";
import { HolidayEditor } from "./holiday-editor";
import { InstrumentEditor } from "./instrument-editor";

export default async function InstrumentsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canManage = await roleHasPermission(staff.roleId, "instrument.manage");
  if (!canManage) {
    return <Forbidden message="You don't have permission to manage instruments." />;
  }

  const [instruments, holidays] = await Promise.all([
    getInstrumentEditorData(),
    getMarketHolidayEditorData(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Instruments" }]}
        title="Instruments"
        description="The NSE stocks learners can paper-trade. No draft/publish split - edits apply immediately, same trust tier as a content hotfix. Halting a symbol lives in the Ops console (Phase 4 Checkpoint 9), not here."
      />

      <InstrumentEditor instruments={instruments} canManage={canManage} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Market holidays</h2>
        <p className="text-sm text-muted-foreground">
          NSE trading holidays - drives the market-hours check the order pad uses.
        </p>
        <HolidayEditor holidays={holidays} canManage={canManage} />
      </div>
    </div>
  );
}
