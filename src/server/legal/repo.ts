import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { legalAcceptances, legalDocuments } from "@/db/schema";
import type { LegalDocumentContent } from "./schemas";

export type LegalDocumentType = "terms" | "privacy" | "risk_disclosure";
export const LEGAL_DOCUMENT_TYPES: readonly LegalDocumentType[] = [
  "terms",
  "privacy",
  "risk_disclosure",
];

export async function getPublishedDocument(type: LegalDocumentType) {
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.type, type), eq(legalDocuments.status, "published")))
    .orderBy(desc(legalDocuments.version))
    .limit(1);
  return row ?? null;
}

// One row per type - the currently published version, or omitted if a type
// has never been published yet (shouldn't happen once Phase 2a's seed has
// run, but the caller shouldn't assume all three always exist).
export async function listPublishedDocuments() {
  const docs = await Promise.all(LEGAL_DOCUMENT_TYPES.map((type) => getPublishedDocument(type)));
  return docs.filter((d): d is NonNullable<typeof d> => d !== null);
}

export async function getDraftDocument(type: LegalDocumentType) {
  const [row] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.type, type), eq(legalDocuments.status, "draft")))
    .limit(1);
  return row ?? null;
}

// Creates the type's first-ever draft (version = published version + 1, or
// 1 if never published), or updates the content of an existing draft in
// place - there is at most one draft per type at a time.
export async function upsertDraft(type: LegalDocumentType, content: LegalDocumentContent) {
  const existingDraft = await getDraftDocument(type);
  if (existingDraft) {
    const [updated] = await db
      .update(legalDocuments)
      .set({ content })
      .where(eq(legalDocuments.id, existingDraft.id))
      .returning();
    return updated;
  }

  const published = await getPublishedDocument(type);
  const nextVersion = (published?.version ?? 0) + 1;
  const [created] = await db
    .insert(legalDocuments)
    .values({ type, version: nextVersion, content, status: "draft" })
    .returning();
  return created;
}

// Flips the type's current draft to published. Returns null if there's no
// draft to publish (caller turns that into a 404).
export async function publishDraft(type: LegalDocumentType, staffId: string) {
  const draft = await getDraftDocument(type);
  if (!draft) return null;
  const [published] = await db
    .update(legalDocuments)
    .set({ status: "published", publishedBy: staffId, publishedAt: new Date() })
    .where(eq(legalDocuments.id, draft.id))
    .returning();
  return published;
}

export async function getAcceptances(
  userId: string,
  legalDocumentIds: string[],
  acceptedBy: "self" | "parent",
) {
  if (legalDocumentIds.length === 0) return [];
  return db
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, userId),
        eq(legalAcceptances.acceptedBy, acceptedBy),
        inArray(legalAcceptances.legalDocumentId, legalDocumentIds),
      ),
    );
}

export async function insertAcceptance(
  userId: string,
  legalDocumentId: string,
  acceptedBy: "self" | "parent",
) {
  const [row] = await db
    .insert(legalAcceptances)
    .values({ userId, legalDocumentId, acceptedBy })
    .returning();
  return row;
}
