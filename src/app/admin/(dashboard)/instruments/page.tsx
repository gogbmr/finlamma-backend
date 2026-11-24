import { TrendingUp } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { getStaffMember } from "@/lib/auth";
import { paginateRows, readPageParams } from "@/lib/admin/paginate";
import { getPermissionKeysForRole } from "@/server/staff/repo";
import { getInstrumentEditorData, getMarketHolidayEditorData } from "@/server/trading/service";
import { HolidayEditor } from "./holiday-editor";
import { InstrumentEditor } from "./instrument-editor";

type InstrumentRow = Awaited<ReturnType<typeof getInstrumentEditorData>>[number];

// Task 3a: same pattern as Worlds/Mentors/Badges/Rewards/Competitions - see
// src/lib/admin/paginate.ts. getInstrumentEditorData() itself is unchanged;
// HolidayEditor/getMarketHolidayEditorData below is untouched.
const INSTRUMENT_SORT_COMPARATORS: Record<string, (a: InstrumentRow, b: InstrumentRow) => number> = {
  symbol: (a, b) => a.symbol.localeCompare(b.symbol),
  name: (a, b) => a.name.localeCompare(b.name),
  sector: (a, b) => a.sector.localeCompare(b.sector),
};

// Searches every language of the localized about/tip fields too, not just
// symbol/name/sector/tags.
function instrumentSearchText(i: InstrumentRow): string {
  return `${i.symbol} ${i.name} ${i.sector} ${i.tags.join(" ")} ${i.about.en} ${i.about.hi} ${i.about.hx} ${i.tip.en} ${i.tip.hi} ${i.tip.hx}`;
}

type ActiveFilter = "active" | "inactive" | null;

function parseActiveFilter(raw: string | string[] | undefined): ActiveFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "active" || value === "inactive" ? value : null;
}

export default async function InstrumentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const grantedKeys = await getPermissionKeysForRole(staff.roleId);
  const canCreate = grantedKeys.has("instrument.create");
  const canEdit = grantedKeys.has("instrument.edit");
  if (!grantedKeys.has("instrument.view")) {
    return <Forbidden message="You don't have permission to view instruments." />;
  }

  const [instruments, holidays] = await Promise.all([
    getInstrumentEditorData(),
    getMarketHolidayEditorData(),
  ]);

  const params = searchParams ? await searchParams : {};
  const pageState = readPageParams(params, {
    defaultSort: "symbol",
    allowedSorts: Object.keys(INSTRUMENT_SORT_COMPARATORS),
  });
  const activeFilter = parseActiveFilter(params.active);

  const paged = paginateRows(instruments, {
    search: pageState.q,
    searchText: instrumentSearchText,
    filter: activeFilter ? (i) => i.active === (activeFilter === "active") : undefined,
    sort: pageState.sort,
    dir: pageState.dir,
    comparators: INSTRUMENT_SORT_COMPARATORS,
    page: pageState.page,
    pageSize: pageState.pageSize,
  });

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Instruments" }]}
            icon={TrendingUp}
            title="Instruments"
          />
        </div>

        <InstrumentEditor
          instruments={paged.rows}
          canCreate={canCreate}
          canEdit={canEdit}
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          q={pageState.q}
          sort={pageState.sort}
          dir={pageState.dir}
          active={activeFilter}
        />

        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Market holidays</p>
          <p className="text-sm text-muted-foreground">
            NSE trading holidays - drives the market-hours check the order pad uses.
          </p>
          <HolidayEditor holidays={holidays} canEdit={canEdit} />
        </div>
      </div>
    </AdminGlassBackground>
  );
}
