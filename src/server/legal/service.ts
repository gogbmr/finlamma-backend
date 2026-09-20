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
    isPlaceholder: doc.isPlaceholder,
  };
}

export async function getPublicDocument(type: LegalDocumentType) {
  const doc = await getPublishedDocument(type);
  if (!doc) throw new AppError("NOT_FOUND", `No published ${type} document yet`);
  return toPublicDocument(doc);
}

// `requiresParentReapproval`/`parentApproved` let requireFullAccess
// (src/server/onboarding/service.ts) enforce the reapproval flow without
// its own legal_acceptances queries. A document that never required
// reapproval (the overwhelming common case) always reports
// `parentApproved: true` - only a document staff explicitly published with
// `requires_parent_reapproval = true` can ever make this false, and only
// until a fresh `accepted_by: 'parent'` row exists for its current version.
export async function getLegalStatus(user: { id: string }) {
  const published = await listPublishedDocuments();
  const docIds = published.map((d) => d.id);
  const [selfAcceptances, parentAcceptances] = await Promise.all([
    getAcceptances(user.id, docIds, "self"),
    getAcceptances(user.id, docIds, "parent"),
  ]);
  const selfByDocId = new Map(selfAcceptances.map((a) => [a.legalDocumentId, a]));
  const parentByDocId = new Map(parentAcceptances.map((a) => [a.legalDocumentId, a]));

  const documents = published.map((doc) => {
    const selfAcceptance = selfByDocId.get(doc.id);
    const parentAcceptance = parentByDocId.get(doc.id);
    return {
      type: doc.type,
      currentVersion: doc.version,
      accepted: Boolean(selfAcceptance),
      acceptedAt: selfAcceptance?.acceptedAt.toISOString() ?? null,
      requiresParentReapproval: doc.requiresParentReapproval,
      parentApproved: !doc.requiresParentReapproval || Boolean(parentAcceptance),
    };
  });

  return {
    documents,
    allAccepted: documents.every((d) => d.accepted),
    allParentApproved: documents.every((d) => d.parentApproved),
  };
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
  requiresParentReapproval: boolean,
  meta: RequestMeta,
) {
  const published = await publishDraft(type, actor.id, requiresParentReapproval);
  if (!published) throw new AppError("NOT_FOUND", `No draft ${type} document to publish`);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "legal.published",
    targetType: "legal_document",
    targetId: published.id,
    metadata: {
      type,
      version: published.version,
      requiresParentReapproval: published.requiresParentReapproval,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return published;
}
