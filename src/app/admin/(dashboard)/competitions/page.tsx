import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { roleHasPermission } from "@/server/staff/repo";
import { listAllBadges } from "@/server/badges/repo";
import { listAllInstruments } from "@/server/trading/repo";
import { getCompetitionSettingsForAdmin, listCompetitionsForAdminService } from "@/server/competitions/service";
import { CompetitionsEditor } from "./competitions-editor";

type CompetitionRow = {
  id: string;
  name: { en: string; hi: string; hx: string };
  instrumentId: string;
  virtualCapitalPaise: number;
  windowStart: string;
  windowEnd: string;
  prizes: { rankFrom: number; rankTo: number; vmAmount: number; badgeId: string | null }[];
  rules: { en: string; hi: string; hx: string };
  status: "draft" | "published";
};

// Task 3a: same pattern as Worlds/Mentors/Badges/Rewards - see
// src/lib/admin/paginate.ts. listCompetitionsForAdminService() itself is
// unchanged; the separate settings panel (updateCompetitionSettingsAction)
// below is untouched.
const COMPETITION_SORT_COMPARATORS: Record<string, (a: CompetitionRow, b: CompetitionRow) => number> = {
  name: (a, b) => a.name.en.localeCompare(b.name.en),
  windowStart: (a, b) => a.windowStart.localeCompare(b.windowStart),
  windowEnd: (a, b) => a.windowEnd.localeCompare(b.windowEnd),
  status: (a, b) => a.status.localeCompare(b.status),
};

function competitionSearchText(c: CompetitionRow): string {
  return `${c.name.en} ${c.name.hi} ${c.name.hx}`;
}

type StatusFilter = "draft" | "published" | null;

function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "draft" || value === "published" ? value : null;
}

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canView = await roleHasPermission(staff.roleId, "competition.view");
  if (!canView) {
    return <Forbidden message="You don't have permission to view the Monthly Competition. Only super_admin does." />;
  }

  const [competitions, instruments, badges, settings] = await Promise.all([
    listCompetitionsForAdminService(),
    listAllInstruments(),
    listAllBadges(),
    getCompetitionSettingsForAdmin(),
  ]);

  const mappedCompetitions: CompetitionRow[] = competitions.map((c) => ({
    id: c.id,
    name: c.name,
    instrumentId: c.instrumentId,
    virtualCapitalPaise: c.virtualCapitalPaise,
    windowStart: c.windowStart.toISOString(),
    windowEnd: c.windowEnd.toISOString(),
    prizes: c.prizes,
    rules: c.rules,
    status: c.status,
  }));

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    allowedSorts: Object.keys(COMPETITION_SORT_COMPARATORS),
  });
  const statusFilter = parseStatusFilter(params.status);

  const paged = paginateRows(mappedCompetitions, {
    search: pageState.q,
    searchText: competitionSearchText,
    filter: statusFilter ? (c) => c.status === statusFilter : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: COMPETITION_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Competitions" }]}
            title="Monthly Competition"
          />
        </div>

        <CompetitionsEditor
          competitions={paged.rows}
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          q={pageState.q}
          sort={pageState.sort}
          dir={pageState.dir}
          status={statusFilter}
          instruments={instruments.map((i) => ({ id: i.id, symbol: i.symbol, name: i.name }))}
          badges={badges.map((b) => ({ id: b.id, name: b.name }))}
          settings={settings}
        />
      </div>
    </AdminGlassBackground>
  );
}
