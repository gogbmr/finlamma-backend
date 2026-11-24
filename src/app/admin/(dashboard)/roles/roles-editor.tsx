"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Info, KeyRound, ShieldCheck } from "lucide-react";
import { GLASS_PANEL, GlassIconChip } from "@/components/admin/glass";
import { cn } from "@/lib/cn";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
} from "../staff/actions";

type Role = { id: string; key: string; name: string; description: string | null };
type Permission = { id: string; key: string; description: string | null };

const OPS = ["view", "create", "edit", "delete"] as const;

// Splits "world.delete" into { resource: "world", op: "delete" } - the
// matrix groups by resource and shows a checkbox only for ops that
// resource actually has a permission row for (not every resource has
// all four - see scripts/seed-roles.ts).
function parseKey(key: string): { resource: string; op: string } {
  const lastDot = key.lastIndexOf(".");
  return { resource: key.slice(0, lastDot), op: key.slice(lastDot + 1) };
}

export function RolesEditor({
  roles,
  permissions,
  permissionKeysByRole,
  viewerRoleId,
}: {
  roles: Role[];
  permissions: Permission[];
  permissionKeysByRole: Record<string, string[]>;
  viewerRoleId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | "new" | null>(roles[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  const permissionIdByKey = useMemo(
    () => new Map(permissions.map((p) => [p.key, p.id] as const)),
    [permissions],
  );

  // Resource -> which ops it actually has a permission for, in a stable
  // order - drives the matrix's columns per row without hardcoding the
  // per-resource op list here (it would drift from scripts/seed-roles.ts).
  const resources = useMemo(() => {
    const byResource = new Map<string, Set<string>>();
    for (const p of permissions) {
      const { resource, op } = parseKey(p.key);
      if (!byResource.has(resource)) byResource.set(resource, new Set());
      byResource.get(resource)!.add(op);
    }
    return [...byResource.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function selectRole(id: string | "new") {
    setSelectedId(id);
  }

  function createRole(input: { key: string; name: string; description: string }) {
    startTransition(async () => {
      const result = await createRoleAction({
        key: input.key,
        name: input.name,
        description: input.description || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role created");
      setSelectedId(null);
    });
  }

  function saveRoleDetails(roleId: string, name: string, description: string) {
    startTransition(async () => {
      const result = await updateRoleAction({ roleId, name, description: description || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role updated");
    });
  }

  function savePermissions(roleId: string, permissionIds: string[]) {
    startTransition(async () => {
      const result = await setRolePermissionsAction({ roleId, permissionIds });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Permissions updated");
    });
  }

  function doDeleteRole(roleId: string) {
    startTransition(async () => {
      const result = await deleteRoleAction({ roleId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role deleted");
      setSelectedId(null);
    });
  }

  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Roles</p>
          <Button type="button" size="sm" variant="outline" onClick={() => selectRole("new")}>
            + New
          </Button>
        </div>
        <ul className="space-y-1">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => selectRole(role.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === role.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {role.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {selectedId === "new" ? (
          <NewRoleForm onCreate={createRole} isPending={isPending} />
        ) : selectedRole ? (
          <RoleDetail
            role={selectedRole}
            resources={resources}
            permissionIdByKey={permissionIdByKey}
            grantedKeys={new Set(permissionKeysByRole[selectedRole.id] ?? [])}
            isPending={isPending}
            isViewerOwnRole={selectedRole.id === viewerRoleId}
            onSaveDetails={saveRoleDetails}
            onSavePermissions={savePermissions}
            onRequestDelete={() => setConfirmDelete(selectedRole)}
          />
        ) : (
          <EmptyState icon={KeyRound} title="No role selected" description="Pick a role on the left, or create a new one." />
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this role?"
        description={
          <>
            {confirmDelete?.name} will be permanently deleted. Only possible while no staff
            member still holds it - if one does, this will fail and say so. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDelete) doDeleteRole(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function NewRoleForm({
  onCreate,
  isPending,
}: {
  onCreate: (input: { key: string; name: string; description: string }) => void;
  isPending: boolean;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className={cn(GLASS_PANEL, "space-y-4 p-4")}>
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <GlassIconChip icon={KeyRound} className="h-6 w-6 rounded-md" />
        New role
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Key</Label>
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="content_reviewer"
          />
          <p className="text-xs text-muted-foreground">Lowercase letters, numbers and underscores only.</p>
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Content Reviewer" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button
        type="button"
        disabled={isPending || !key || !name}
        onClick={() => onCreate({ key, name, description })}
      >
        {isPending ? "Creating…" : "Create role"}
      </Button>
    </div>
  );
}

function RoleDetail({
  role,
  resources,
  permissionIdByKey,
  grantedKeys,
  isPending,
  isViewerOwnRole,
  onSaveDetails,
  onSavePermissions,
  onRequestDelete,
}: {
  role: Role;
  resources: [string, Set<string>][];
  permissionIdByKey: Map<string, string>;
  grantedKeys: Set<string>;
  isPending: boolean;
  isViewerOwnRole: boolean;
  onSaveDetails: (roleId: string, name: string, description: string) => void;
  onSavePermissions: (roleId: string, permissionIds: string[]) => void;
  onRequestDelete: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  // Checked state keyed by permission KEY (not id) - stays readable in
  // JSX/handlers, converted to ids only at save time.
  const [checked, setChecked] = useState<Set<string>>(grantedKeys);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function savePermissions() {
    const permissionIds = [...checked]
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id));
    onSavePermissions(role.id, permissionIds);
  }

  const isDirty =
    checked.size !== grantedKeys.size || [...checked].some((k) => !grantedKeys.has(k));

  return (
    <div className="space-y-6">
      <div className={cn(GLASS_PANEL, "space-y-3 p-4")}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GlassIconChip icon={Info} className="h-6 w-6 rounded-md" />
            {role.name} <span className="font-mono text-xs text-muted-foreground">({role.key})</span>
          </p>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onRequestDelete}>
            Delete role
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={isPending} />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => onSaveDetails(role.id, name, description)}
        >
          Save details
        </Button>
      </div>

      <div className={cn(GLASS_PANEL, "space-y-3 p-4")}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GlassIconChip icon={ShieldCheck} className="h-6 w-6 rounded-md" />
            Permissions
          </p>
          <Button type="button" size="sm" disabled={isPending || !isDirty} onClick={savePermissions}>
            {isPending ? "Saving…" : "Save permissions"}
          </Button>
        </div>
        {isViewerOwnRole && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            This is your own role - removing a permission you rely on takes effect immediately
            and could lock you out of this page. A lockout guard blocks removing the last active
            staff.edit/staff.delete holder, but not every other permission.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="py-1 pr-2">Resource</th>
                {OPS.map((op) => (
                  <th key={op} className="px-2 py-1 text-center">
                    {op}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map(([resource, ops]) => (
                <tr key={resource} className="border-t border-border">
                  <td className="py-1.5 pr-2 font-mono text-xs">{resource}</td>
                  {OPS.map((op) => {
                    const key = `${resource}.${op}`;
                    if (!ops.has(op)) return <td key={op} className="px-2 py-1.5 text-center text-muted-foreground">—</td>;
                    return (
                      <td key={op} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          disabled={isPending}
                          checked={checked.has(key)}
                          onChange={() => toggle(key)}
                          aria-label={key}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
