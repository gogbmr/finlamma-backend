import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import {
  getAcceptances,
  getDraftDocument,
  getPublishedDocument,
  insertAcceptance,
  listPublishedDocuments,
  publishDraft,
  upsertDraft,
  type LegalDocumentType,
} from "./repo";
import type { LegalDocumentContent } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type LegalDocumentRow = NonNullable<Awaited<ReturnType<typeof getPublishedDocument>>>;

function toPublicDocument(doc: LegalDocumentRow) {
  return {
    type: doc.type,
    version: doc.version,
    content: doc.content,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
  };
}

export async function getPublicDocument(type: LegalDocumentType) {
  const doc = await getPublishedDocument(type);
  if (!doc) throw new AppError("NOT_FOUND", `No published ${type} document yet`);
  return toPublicDocument(doc);
}

export async function getLegalStatus(user: { id: string }) {
  const published = await listPublishedDocuments();
  const acceptances = await getAcceptances(
    user.id,
    published.map((d) => d.id),
    "self",
  );
  const acceptanceByDocId = new Map(acceptances.map((a) => [a.legalDocumentId, a]));

  const documents = published.map((doc) => {
    const acceptance = acceptanceByDocId.get(doc.id);
    return {
      type: doc.type,
      currentVersion: doc.version,
      accepted: Boolean(acceptance),
      acceptedAt: acceptance?.acceptedAt.toISOString() ?? null,
    };
  });

  return { documents, allAccepted: documents.every((d) => d.accepted) };
}

// Records the caller's own acceptance of every currently published document
// they haven't already self-accepted at this version. Used by an adult for
// their own acceptance, and by a minor for the required in-app acceptance
// after their parent has consented (see src/server/onboarding).
export async function acceptLegal(user: { id: string }, meta: RequestMeta) {
  const published = await listPublishedDocuments();
  const acceptances = await getAcceptances(
    user.id,
    published.map((d) => d.id),
    "self",
  );
  const alreadyAcceptedIds = new Set(acceptances.map((a) => a.legalDocumentId));
  const toAccept = published.filter((d) => !alreadyAcceptedIds.has(d.id));

  for (const doc of toAccept) {
    await insertAcceptance(user.id, doc.id, "self");
  }

  if (toAccept.length > 0) {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "legal.accepted",
      targetType: "user",
      targetId: user.id,
      metadata: {
        types: toAccept.map((d) => d.type),
        versions: toAccept.map((d) => d.version),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return { accepted: toAccept.map((d) => d.type) };
}

// --- Staff (admin) ---

export async function getLegalEditorData(type: LegalDocumentType) {
  const [published, draft] = await Promise.all([
    getPublishedDocument(type),
    getDraftDocument(type),
  ]);
  return { published, draft };
}

export async function upsertLegalDraft(
  actor: { id: string },
  type: LegalDocumentType,
  content: LegalDocumentContent,
  meta: RequestMeta,
) {
  const draft = await upsertDraft(type, content);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "legal.draft_saved",
    targetType: "legal_document",
    targetId: draft.id,
    metadata: { type, version: draft.version },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return draft;
}

// Publishing a new version doesn't touch existing legal_acceptances rows -
// they stay tied to the old version's legal_document_id. Re-acceptance
// "prompting" falls straight out of getLegalStatus() comparing against the
// newly published id, which nobody has an acceptance row for yet.
export async function publishLegalDocument(
  actor: { id: string },
  type: LegalDocumentType,
  meta: RequestMeta,
) {
  const published = await publishDraft(type, actor.id);
  if (!published) throw new AppError("NOT_FOUND", `No draft ${type} document to publish`);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "legal.published",
    targetType: "legal_document",
    targetId: published.id,
    metadata: { type, version: published.version },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return published;
}
