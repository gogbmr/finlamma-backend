import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { AdminGlassBackground, glassPanel } from "@/components/admin/glass";
import { requireStaff } from "@/lib/auth";
import { LEGAL_DOCUMENT_TYPES } from "@/server/legal/repo";
import { getLegalEditorData } from "@/server/legal/service";
import { LegalEditor } from "./legal-editor";

export default async function LegalPage() {
  try {
    await requireStaff("legal.view");
  } catch {
    return <Forbidden message="You don't have permission to view legal documents." />;
  }

  // LEGAL_DOCUMENT_TYPES is a fixed 3-element compile-time constant, not a
  // runtime-length array - 3 concurrent queries stays under the pool's max: 4.
  // promise-all-db-concurrency-ok: fixed 3-element constant, under max: 4
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
    <AdminGlassBackground>
      <div className="space-y-3">
        <div className={glassPanel("px-5 py-4")}>
          <PageHeader
            breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Legal" }]}
            title="Legal documents"
          />
        </div>

        <LegalEditor documents={documents} />
      </div>
    </AdminGlassBackground>
  );
}
