import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicDocument } from "@/server/legal/service";
import { LegalDocumentClient } from "./legal-document-client";

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
    <LegalDocumentClient
      type={type}
      version={doc.version}
      content={doc.content}
      isPlaceholder={doc.isPlaceholder}
    />
  );
}
