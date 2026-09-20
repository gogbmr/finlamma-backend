import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { legalAcceptances, legalDocuments } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
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

// Used by the reapproval flow (src/server/onboarding/service.ts) to look up
// which document type/version/content a reapproval token is about.
export async function getLegalDocumentById(id: string) {
  const [row] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, id)).limit(1);
  return row ?? null;
}

// Creates the type's first-ever draft (version = published version + 1, or
// 1 if never published), or updates the content of an existing draft in
// place - there is at most one draft per type at a time.
//
// Two concurrent calls (a double-click, or two legal.manage staff saving at
// once) can both take the "no existing draft" branch and both insert the
// same computed version - the unique index on (type, version) prevents
// actual duplicate/corrupt data, but an audit found the loser used to
// crash with a raw unhandled error instead of a clean retry, unlike the
// equivalent race in claimConsentRequestSlot. The loser now re-fetches
// (the winner's insert has already landed by the time this catch runs) and
// updates that row's content instead - so the field the staff member typed
// is never silently lost, it just ends up on the draft the other request
// created a moment earlier.
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
  try {
    const [created] = await db
      .insert(legalDocuments)
      .values({ type, version: nextVersion, content, status: "draft" })
      .returning();
    return created;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const draftFromWinner = await getDraftDocument(type);
    if (!draftFromWinner) throw err; // shouldn't happen, but don't hide the real error if it does
    const [updated] = await db
      .update(legalDocuments)
      .set({ content })
      .where(eq(legalDocuments.id, draftFromWinner.id))
      .returning();
    return updated;
  }
}

// Flips the type's current draft to published. Returns null if there's no
// draft to publish (caller turns that into a 404). `requiresParentReapproval`
// is the staff's explicit choice at publish time (see
// src/server/legal/service.ts publishLegalDocument) - always forced to
// false for a placeholder draft regardless of what's passed in, since
// re-approving filler text makes no sense (and nothing in the current admin
// editor flow ever creates a placeholder draft anyway - this is defensive).
export async function publishDraft(
  type: LegalDocumentType,
  staffId: string,
  requiresParentReapproval: boolean,
) {
  const draft = await getDraftDocument(type);
  if (!draft) return null;
  const effectiveReapproval = draft.isPlaceholder ? false : requiresParentReapproval;
  const [published] = await db
    .update(legalDocuments)
    .set({
      status: "published",
      publishedBy: staffId,
      publishedAt: new Date(),
      requiresParentReapproval: effectiveReapproval,
    })
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
