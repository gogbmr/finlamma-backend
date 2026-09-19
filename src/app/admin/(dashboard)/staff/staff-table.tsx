"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/admin/data-table";
import { setStaffActiveAction, updateStaffRoleAction } from "./actions";

export type StaffRow = {
  id: string;
  clerkUserId: string;
  active: boolean;
  roleId: string;
  roleName: string;
};

export function StaffTable({
  staff,
  roles,
}: {
  staff: StaffRow[];
  roles: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffRow | null>(null);

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
        header: "Clerk user ID",
        accessorKey: "clerkUserId",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.clerkUserId}</span>
        ),
      },
      {
        header: "Role",
        accessorKey: "roleId",
        cell: ({ row }) => (
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
        ),
      },
      {
        header: "Status",
        accessorKey: "active",
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "success" : "muted"}>
            {row.original.active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const s = row.original;
          return s.active ? (
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
          );
        },
      },
    ],
    [isPending, roles, changeRole, setActive],
  );

  return (
    <>
      <DataTable columns={columns} data={staff} emptyMessage="No staff members yet." />

      <AlertDialog
        open={confirmDeactivate !== null}
        onOpenChange={(open) => !open && setConfirmDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate staff member?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.clerkUserId} will immediately lose access to this admin
              dashboard. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeactivate) setActive(confirmDeactivate.id, false);
                setConfirmDeactivate(null);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
