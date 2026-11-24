"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  DataTable,
  DataTablePagination,
  DataTableSearchForm,
  DataTableSortHeader,
  type AdminListUrlState,
} from "@/components/admin/data-table";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { glassPanel } from "@/components/admin/glass";
import { cn } from "@/lib/cn";
import { setStaffActiveAction, updateStaffRoleAction } from "./actions";
import { StaffProfilePanel } from "./staff-profile-panel";

export type StaffRow = {
  id: string;
  clerkUserId: string;
  active: boolean;
  roleId: string;
  roleName: string;
  email: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  phone: string | null;
  address: string | null;
  photoUrl: string | null;
};

type ActiveFilter = "active" | "inactive" | null;

const ACTIVE_OPTIONS: { value: ActiveFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function activeFilterHref(
  pathname: string,
  state: AdminListUrlState,
  active: ActiveFilter,
): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.sort) sp.set("sort", state.sort);
  if (state.dir === "desc") sp.set("dir", "desc");
  if (state.pageSize !== 20) sp.set("pageSize", String(state.pageSize));
  if (active) sp.set("active", active);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function StaffTable({
  staff,
  roles,
  total,
  page,
  pageCount,
  pageSize,
  q,
  sort,
  dir,
  active,
  viewerId,
  canEdit,
  canDelete,
}: {
  staff: StaffRow[];
  roles: { id: string; name: string }[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  active: ActiveFilter;
  viewerId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const pathname = usePathname();
  const state: AdminListUrlState = { q, sort, dir, pageSize };
  const [isPending, startTransition] = useTransition();
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffRow | null>(null);
  const [editingProfile, setEditingProfile] = useState<StaffRow | null>(null);

  const changeRole = useCallback((staffId: string, roleId: string) => {
    startTransition(async () => {
      const result = await updateStaffRoleAction({ staffId, roleId });
      if (!result.ok) toast.error(result.error);
      else toast.success("Role updated");
    });
  }, []);

  const setActive = useCallback((staffId: string, active: boolean) => {
    startTransition(async () => {
      const result = await setStaffActiveAction({ staffId, active });
      if (!result.ok) toast.error(result.error);
      else toast.success(active ? "Staff member activated" : "Staff member deactivated");
    });
  }, []);

  const columns = useMemo<ColumnDef<StaffRow, unknown>[]>(
    () => [
      {
        id: "clerkUserId",
        header: () => (
          <DataTableSortHeader label="Clerk user ID" field="clerkUserId" pathname={pathname} state={state} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.clerkUserId}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.email ?? "—"}</span>
        ),
      },
      {
        id: "roleName",
        header: () => (
          <DataTableSortHeader label="Role" field="roleName" pathname={pathname} state={state} />
        ),
        cell: ({ row }) =>
          canEdit ? (
            <Select
              value={row.original.roleId}
              onValueChange={(roleId) => changeRole(row.original.id, roleId)}
              disabled={isPending}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            row.original.roleName
          ),
      },
      {
        header: "Status",
        accessorKey: "active",
        cell: ({ row }) => (
          <StatusBadge status={row.original.active ? "active" : "inactive"}>
            {row.original.active ? "Active" : "Inactive"}
          </StatusBadge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const s = row.original;
          const isSelf = s.id === viewerId;
          return (
            <div className="flex items-center justify-end gap-2">
              {(isSelf || canEdit) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setEditingProfile(s)}
                >
                  Profile
                </Button>
              )}
              {canDelete &&
                (s.active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setConfirmDeactivate(s)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setActive(s.id, true)}
                  >
                    Activate
                  </Button>
                ))}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPending, roles, changeRole, setActive, pathname, q, sort, dir, pageSize, canEdit, canDelete, viewerId],
  );

  return (
    <>
      <div className={glassPanel("space-y-4 p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4 text-sm">
            {ACTIVE_OPTIONS.map((opt) => (
              <Link
                key={opt.label}
                href={activeFilterHref(pathname, state, opt.value)}
                className={cn(
                  active === opt.value
                    ? "font-semibold text-foreground underline"
                    : "text-muted-foreground hover:underline",
                )}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <DataTableSearchForm pathname={pathname} state={state} placeholder="Search Clerk ID or role…" />
        </div>

        <DataTable
          columns={columns}
          data={staff}
          emptyState={
            <EmptyState
              icon={Users}
              title={q ? "No staff match your search" : "No staff members yet"}
              description={
                q
                  ? `Nothing matched "${q}" - try a different Clerk ID or role.`
                  : "Invite your first staff member above."
              }
            />
          }
        />
        <DataTablePagination
          pathname={pathname}
          state={state}
          page={page}
          pageCount={pageCount}
          total={total}
          noun="staff members"
        />
      </div>

      <ConfirmDialog
        open={confirmDeactivate !== null}
        onOpenChange={(open) => !open && setConfirmDeactivate(null)}
        title="Deactivate staff member?"
        description={
          <>
            {confirmDeactivate?.clerkUserId} will immediately lose access to this admin
            dashboard. You can reactivate them later.
          </>
        }
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (confirmDeactivate) setActive(confirmDeactivate.id, false);
          setConfirmDeactivate(null);
        }}
      />

      {editingProfile && (
        <StaffProfilePanel
          staff={editingProfile}
          onClose={() => setEditingProfile(null)}
        />
      )}
    </>
  );
}
