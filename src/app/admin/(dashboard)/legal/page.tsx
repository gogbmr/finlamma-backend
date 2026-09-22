import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { requireStaff } from "@/lib/auth";
import { LEGAL_DOCUMENT_TYPES } from "@/server/legal/repo";
import { getLegalEditorData } from "@/server/legal/service";
import { LegalEditor } from "./legal-editor";

export default async function LegalPage() {
  try {
    await requireStaff("legal.manage");
  } catch {
    return <Forbidden message="You don't have permission to manage legal documents." />;
  }

  const documents = await Promise.all(
    LEGAL_DOCUMENT_TYPES.map(async (type) => {
      const { published, draft } = await getLegalEditorData(type);
      return {
        type,
        published: published
          ? {
              version: published.version,
              content: published.content,
              publishedAt: published.publishedAt?.toISOString() ?? null,
              isPlaceholder: published.isPlaceholder,
            }
          : null,
        draft: draft ? { version: draft.version, content: draft.content } : null,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin/staff" }, { label: "Legal" }]}
        title="Legal documents"
        description="Terms, Privacy and Risk-disclosure text - staff-editable, versioned. Only super_admin can publish. Publishing a new version prompts every user (and every consenting parent) to re-accept it. v1 seeds these as DRAFT placeholders until the outside legal review in docs/ROADMAP.md's pre-launch checklist - never publish real text without that review."
      />

      <LegalEditor documents={documents} />
    </div>
  );
}
