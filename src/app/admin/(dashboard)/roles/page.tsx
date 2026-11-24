import { KeyRound } from "lucide-react";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { requireStaff } from "@/lib/auth";
import { getRolesPageData } from "@/server/staff/service";
import { RolesEditor } from "./roles-editor";

// Roles & Permissions admin page (new in this phase, see
// docs/ARCHITECTURE.md's permissions-rework decision): lists the fixed
// catalog of roles, lets a roles.create/roles.edit/roles.delete holder
// manage them, and assigns the resource.op permission matrix per role.
// getRolesPageData() already resolves every role's granted keys in one
// batch (src/server/staff/service.ts) - this page just reshapes that Map
// into a plain object, since a Map doesn't serialize across the Server/
// Client Component boundary.
export default async function RolesPage() {
  let viewer;
  try {
    viewer = await requireStaff("roles.view");
  } catch {
    return <Forbidden message="You don't have permission to view roles." />;
  }

  const { roles, permissions, permissionKeysByRoleId } = await getRolesPageData();

  const permissionKeysByRole: Record<string, string[]> = {};
  for (const role of roles) {
    permissionKeysByRole[role.id] = [...(permissionKeysByRoleId.get(role.id) ?? [])];
  }

  return (
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Roles" }]}
            icon={KeyRound}
            title="Roles & Permissions"
          />
        </div>

        <RolesEditor
          roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description }))}
          permissions={permissions.map((p) => ({ id: p.id, key: p.key, description: p.description }))}
          permissionKeysByRole={permissionKeysByRole}
          viewerRoleId={viewer.roleId}
        />
      </div>
    </AdminGlassBackground>
  );
}
