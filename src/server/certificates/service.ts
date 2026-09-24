import { logActivity } from "@/lib/activity-log";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";
import type { requestMeta } from "@/lib/http";
import { istYear, istYearStartUtc } from "@/lib/ist-date";
import { getSignedDownloadUrl, uploadObject } from "@/lib/s3";
import { getLevelInfo } from "@/server/leveling/service";
import { getWorldById } from "@/server/worlds/repo";
import {
  countCertificatesForWorldSinceYearStart,
  getCertificate,
  insertCertificateIfAbsent,
  listCertificatesForUser,
  setCertificateFileKey,
} from "./repo";

type RequestMeta = ReturnType<typeof requestMeta>;
type UserRow = { id: string; firstName: string | null; lastInitial: string | null };

const MAX_CODE_COLLISION_RETRIES = 5;

function formatCode(worldCode: string, year: number, seq: number): string {
  return `FL-${worldCode}-${year}-${String(seq).padStart(6, "0")}`;
}

// World completion (D24: passing that world's Boss Quiz - the exact same
// signal getWorldIdsWithPassedBossQuiz reads for world unlock) issues a
// certificate, once, ever, per (user, world) - WH-16/PR-36-38. Called
// directly from src/server/quiz-attempts/service.ts's submitAnswer,
// wrapped in a try/catch there so a certificate-issuance hiccup can never
// block the lesson credit the learner actually came for - this function
// itself is written to be safe to fail loudly (throw) since the caller owns
// that safety net, not this one.
//
// xpEarned/accuracyPct are a point-in-time snapshot, deliberately never
// recomputed later (see src/db/schema/certificates.ts's comment) - a
// certificate's printed numbers stay exactly what was true the day it was
// earned.
export async function issueCertificateIfEligible(
  user: { id: string },
  worldId: string,
  accuracyPct: number,
  meta: RequestMeta,
) {
  const existing = await getCertificate(user.id, worldId);
  if (existing) return existing; // already issued - idempotent no-op

  const world = await getWorldById(worldId);
  if (!world?.code) {
    // A world with no code can't have been published under the current
    // rule (validateWorldForPublish requires it) - this can only mean one
    // of the 7 pre-existing seeded worlds hasn't been backfilled yet
    // (scripts/backfill-world-codes.ts). Log and skip rather than throw,
    // since the caller must not let this break lesson crediting.
    logInternalError(
      "certificates.world_missing_code",
      new Error(`World ${worldId} has no code - cannot issue a certificate`),
    );
    return null;
  }

  const levelInfo = await getLevelInfo(user.id);
  const year = istYear();
  const yearStart = istYearStartUtc(year);

  let nextSeq = (await countCertificatesForWorldSinceYearStart(worldId, yearStart)) + 1;
  for (let attempt = 0; attempt < MAX_CODE_COLLISION_RETRIES; attempt++) {
    const code = formatCode(world.code, year, nextSeq);
    try {
      const inserted = await insertCertificateIfAbsent({
        userId: user.id,
        worldId,
        code,
        xpEarned: levelInfo.totalXp,
        accuracyPct,
      });
      if (!inserted) return await getCertificate(user.id, worldId); // lost an (userId, worldId) race
      await logActivity({
        actorType: "user",
        actorId: user.id,
        action: "certificate.issued",
        targetType: "certificate",
        targetId: inserted.id,
        metadata: { worldId, code, xpEarned: inserted.xpEarned, accuracyPct },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return inserted;
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Lost a race on `code` specifically (two learners finishing this
        // world in the same counting window) - try the next number.
        nextSeq++;
        continue;
      }
      throw err;
    }
  }
  logInternalError(
    "certificates.code_collision_exhausted",
    new Error(`Could not allocate a unique certificate code for world ${worldId} after ${MAX_CODE_COLLISION_RETRIES} attempts`),
  );
  return null;
}

function displayName(user: UserRow): string {
  return [user.firstName, user.lastInitial].filter(Boolean).join(" ") || "Finlamma Learner";
}

export async function listMyCertificates(userId: string) {
  const rows = await listCertificatesForUser(userId);
  const worlds = await Promise.all(rows.map((r) => getWorldById(r.worldId)));
  return rows.map((row, i) => ({
    worldId: row.worldId,
    worldTitle: worlds[i]?.title ?? null,
    code: row.code,
    xpEarned: row.xpEarned,
    accuracyPct: row.accuracyPct,
    issuedAt: row.createdAt,
  }));
}

export async function getMyCertificate(userId: string, worldId: string) {
  const row = await getCertificate(userId, worldId);
  if (!row) throw new AppError("NOT_FOUND", "No certificate for this world yet");
  const world = await getWorldById(worldId);
  return {
    worldId: row.worldId,
    worldTitle: world?.title ?? null,
    code: row.code,
    xpEarned: row.xpEarned,
    accuracyPct: row.accuracyPct,
    issuedAt: row.createdAt,
  };
}

// Lazily renders and uploads the PDF on first request (never at issuance
// time, which stays cheap since it happens inline inside the already-busy
// lesson-answer request - see issueCertificateIfEligible's comment).
// Idempotent: setCertificateFileKey's `fileKey IS NULL` guard means a
// concurrent duplicate request never re-renders or double-uploads: whoever
// loses the race just re-reads the winner's fileKey.
export async function getCertificatePdfUrl(user: UserRow, worldId: string): Promise<string> {
  const row = await getCertificate(user.id, worldId);
  if (!row) throw new AppError("NOT_FOUND", "No certificate for this world yet");

  if (row.fileKey) return getSignedDownloadUrl(row.fileKey);

  // Loaded lazily, not at module top-level: @react-pdf/renderer is a heavy
  // dependency this domain's OTHER export (issueCertificateIfEligible) is
  // imported from the hot lesson-answer path (quiz-attempts/service.ts) -
  // a static import here would pull the whole PDF renderer into that
  // endpoint's bundle for a feature it never touches (PDF rendering only
  // ever happens on an explicit GET .../pdf request).
  const { renderCertificatePdf } = await import("./pdf");
  const world = await getWorldById(worldId);
  const buffer = await renderCertificatePdf({
    displayName: displayName(user),
    worldTitle: world?.title.en ?? "Finlamma World",
    code: row.code,
    xpEarned: row.xpEarned,
    accuracyPct: row.accuracyPct,
    issuedAt: row.createdAt,
  });

  const fileKey = `certificates/${row.id}.pdf`;
  await uploadObject(fileKey, buffer, "application/pdf");
  const updated = await setCertificateFileKey(row.id, fileKey);
  return getSignedDownloadUrl(updated?.fileKey ?? fileKey);
}
