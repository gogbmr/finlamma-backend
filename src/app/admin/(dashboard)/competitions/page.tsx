import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { listAllBadges } from "@/server/badges/repo";
import { listAllInstruments } from "@/server/trading/repo";
import { getCompetitionSettingsForAdmin, listCompetitionsForAdminService } from "@/server/competitions/service";
import { CompetitionsEditor } from "./competitions-editor";

export default async function CompetitionsPage() {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canManage = await roleHasPermission(staff.roleId, "economy.manage");
  if (!canManage) {
    return <Forbidden message="You don't have permission to manage the Monthly Competition. Only super_admin does." />;
  }

  const [competitions, instruments, badges, settings] = await Promise.all([
    listCompetitionsForAdminService(),
    listAllInstruments(),
    listAllBadges(),
    getCompetitionSettingsForAdmin(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Competitions" }]}
        title="Monthly Competition"
        description="A single isolated sandbox portfolio per competition - the starting capital is never V Money and never touches vmoney_ledger (docs/ARCHITECTURE.md D57). Only the prizes paid at settlement create real VM."
      />

      <CompetitionsEditor
        competitions={competitions.map((c) => ({
          id: c.id,
          name: c.name,
          instrumentId: c.instrumentId,
          virtualCapitalPaise: c.virtualCapitalPaise,
          windowStart: c.windowStart.toISOString(),
          windowEnd: c.windowEnd.toISOString(),
          prizes: c.prizes,
          rules: c.rules,
          status: c.status,
        }))}
        instruments={instruments.map((i) => ({ id: i.id, symbol: i.symbol, name: i.name }))}
        badges={badges.map((b) => ({ id: b.id, name: b.name }))}
        settings={settings}
      />
    </div>
  );
}
