import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicDocument } from "@/server/legal/service";

const TITLES = {
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  risk_disclosure: "Risk Disclosure",
} as const;

function isKnownType(type: string): type is keyof typeof TITLES {
  return type in TITLES;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const title = isKnownType(type) ? TITLES[type] : "Legal";
  return { title };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!isKnownType(type)) notFound();

  let doc: Awaited<ReturnType<typeof getPublicDocument>>;
  try {
    doc = await getPublicDocument(type);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Back to Finlamma
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-foreground">{TITLES[type]}</h1>
      {doc.isPlaceholder && (
        <p className="mt-3 rounded-md border border-status-draft-fg/30 bg-status-draft-bg px-3 py-2 text-sm text-status-draft-fg">
          This is a placeholder document pending final legal review.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Version {doc.version}</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
        {doc.content.en}
      </div>
    </div>
  );
}
