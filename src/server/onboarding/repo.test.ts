// Integration tests: these run against an in-process PGlite database
// (src/test/db.ts) instead of mocking `db`, because what's under test here -
// real Postgres transaction rollback - can't be observed through a mock.
// They never touch the real Supabase database (see @/db/client's
// NODE_ENV=test guard).
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  consentRecords,
  dobCorrections,
  legalAcceptances,
  legalDocuments,
  legalReapprovalRequests,
  parentContacts,
  roles,
  staffMembers,
  users,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId, uniqueEmail } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  anonymizeParentContact,
  approveReapprovalAndRecordAcceptance,
  correctDateOfBirth,
  declineReapprovalAndRefuseConsent,
  deleteDobCorrectionsForUser,
  getParentContactByWeeklyReportUnsubscribeTokenHash,
  scrubParentContactDataTx,
  setParentContactWeeklyReportOptIn,
  unsubscribeParentContactFromWeeklyReport,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

// staffId is a real FK to staff_members (app asks batch, section C3) - seeded
// once here, not per-test, same pattern as src/server/legal/repo.test.ts.
const [dobTestRole] = await db
  .insert(roles)
  .values({ key: "super_admin", name: "Super Admin" })
  .returning();
const [dobTestStaff] = await db
  .insert(staffMembers)
  .values({ clerkUserId: uniqueClerkUserId("onboarding-repo-test-staff"), roleId: dobTestRole.id })
  .returning();
const dobStaffId = dobTestStaff.id;

// The vi.mock factory above runs once for this file, so this is a single
// PGlite instance shared by every test below - never recreated per `it()`.
// It's still never reclaimed on its own though (real WASM memory), so it
// must be closed explicitly once the file's tests are done.
afterAll(async () => {
  await db.$client.close();
});

// legal_documents has a unique index on (type, version) - each call in this
// file needs its own version, same "never hardcode a value that hits a
// unique constraint" reasoning as uniqueEmail()/uniqueClerkUserId().
let nextDocVersion = 2;

async function seedConsentedMinorWithPendingReapproval() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("reapproval"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
      email: null,
      dateOfBirth: "2015-01-01",
    })
    .returning();

  const [doc] = await db
    .insert(legalDocuments)
    .values({
      type: "terms",
      version: nextDocVersion++,
      content: { en: "v2", hi: "v2", hx: "v2" },
      status: "published",
      requiresParentReapproval: true,
    })
    .returning();

  const [parentContact] = await db
    .insert(parentContacts)
    .values({ userId: user.id, name: "Priya", email: uniqueEmail("parent") })
    .returning();

  const [consentRecord] = await db
    .insert(consentRecords)
    .values({
      userId: user.id,
      parentContactId: parentContact.id,
      status: "consented",
      tokenHash: `consent-token-${user.id}`,
      tokenExpiresAt: new Date(Date.now() + 1_000_000),
      legalDocumentVersions: { terms: 1 },
    })
    .returning();

  const [reapprovalRequest] = await db
    .insert(legalReapprovalRequests)
    .values({
      userId: user.id,
      legalDocumentId: doc.id,
      parentContactId: parentContact.id,
      status: "pending",
      tokenHash: `reapproval-token-${user.id}`,
      tokenExpiresAt: new Date(Date.now() + 1_000_000),
    })
    .returning();

  return { user, doc, parentContact, consentRecord, reapprovalRequest };
}

describe("approveReapprovalAndRecordAcceptance", () => {
  it("commits the token flip, the acceptance insert and the version merge together", async () => {
    const { user, doc, reapprovalRequest } = await seedConsentedMinorWithPendingReapproval();

    const result = await approveReapprovalAndRecordAcceptance({
      requestId: reapprovalRequest.id,
      userId: user.id,
      legalDocumentId: doc.id,
      documentType: doc.type,
      documentVersion: doc.version,
      actorIp: "1.2.3.4",
      actorUserAgent: "test-agent",
    });

    expect(result?.status).toBe("approved");

    const [updatedRequest] = await db
      .select()
      .from(legalReapprovalRequests)
      .where(eq(legalReapprovalRequests.id, reapprovalRequest.id));
    expect(updatedRequest.status).toBe("approved");
    expect(updatedRequest.usedAt).not.toBeNull();

    const acceptances = await db
      .select()
      .from(legalAcceptances)
      .where(
        and(eq(legalAcceptances.userId, user.id), eq(legalAcceptances.legalDocumentId, doc.id)),
      );
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0].acceptedBy).toBe("parent");

    const [updatedConsent] = await db.select().from(consentRecords).where(eq(consentRecords.userId, user.id));
    expect(updatedConsent.legalDocumentVersions).toEqual({ terms: doc.version });
  });

  // Simulates the exact failure a security audit found: a crash between the
  // token-flip write and the acceptance-insert write. The "crash" is
  // injected via a spy (there's no natural way to make a real process die
  // mid-test on demand), but the transaction, the rollback and every
  // assertion below are 100% real PGlite/Postgres - nothing here is mocked
  // away. This is what actually proves atomicity, not just that the
  // function propagates a rejected promise.
  it("rolls back the token flip too when the acceptance insert fails - the token is not burned, nothing is half-written", async () => {
    const { user, doc, reapprovalRequest } = await seedConsentedMinorWithPendingReapproval();

    const realTransaction = db.transaction.bind(db);
    const transactionSpy = vi.spyOn(db, "transaction").mockImplementationOnce((callback: Parameters<typeof db.transaction>[0]) =>
      realTransaction(async (tx) => {
        const realInsert = tx.insert.bind(tx);
        const insertSpy = vi.spyOn(tx, "insert").mockImplementationOnce((table: Parameters<typeof tx.insert>[0]) => {
          insertSpy.mockRestore();
          throw new Error("simulated crash before the acceptance insert commits");
        });
        // realInsert is unused unless the mock above is hit more than
        // once - keeping the reference silences an unused-var lint error
        // without changing behavior.
        void realInsert;
        return callback(tx);
      }),
    );

    await expect(
      approveReapprovalAndRecordAcceptance({
        requestId: reapprovalRequest.id,
        userId: user.id,
        legalDocumentId: doc.id,
        documentType: doc.type,
        documentVersion: doc.version,
        actorIp: "1.2.3.4",
        actorUserAgent: "test-agent",
      }),
    ).rejects.toThrow("simulated crash");
    transactionSpy.mockRestore();

    // The reapproval row's status flip happened first, inside the same
    // still-open transaction as the failed insert - it must have been
    // rolled back too, or the parent's one-time link would be permanently
    // burned with the acceptance never actually recorded.
    const [row] = await db
      .select()
      .from(legalReapprovalRequests)
      .where(eq(legalReapprovalRequests.id, reapprovalRequest.id));
    expect(row.status).toBe("pending");
    expect(row.usedAt).toBeNull();

    const acceptances = await db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, user.id));
    expect(acceptances).toHaveLength(0);

    const [consentRecord] = await db.select().from(consentRecords).where(eq(consentRecords.userId, user.id));
    expect(consentRecord.legalDocumentVersions).toEqual({ terms: 1 }); // unchanged
  });
});

describe("declineReapprovalAndRefuseConsent", () => {
  it("commits the token flip and the consent revocation together", async () => {
    const { user, reapprovalRequest } = await seedConsentedMinorWithPendingReapproval();

    const result = await declineReapprovalAndRefuseConsent({
      requestId: reapprovalRequest.id,
      userId: user.id,
      actorIp: "1.2.3.4",
      actorUserAgent: "test-agent",
    });

    expect(result?.status).toBe("declined");

    const [updatedRequest] = await db
      .select()
      .from(legalReapprovalRequests)
      .where(eq(legalReapprovalRequests.id, reapprovalRequest.id));
    expect(updatedRequest.status).toBe("declined");

    const [updatedConsent] = await db.select().from(consentRecords).where(eq(consentRecords.userId, user.id));
    expect(updatedConsent.status).toBe("refused");
  });

  // Same failure-injection technique as the approve test above, timed to
  // hit the second of the two update() calls this function makes (the
  // legalReapprovalRequests flip is the first, consent_records is the
  // second) - simulating a crash after the token flip but before the
  // consent revocation actually commits.
  it("rolls back the token flip too when the consent-record revocation fails - status stays 'consented', not silently contradicted", async () => {
    const { user, reapprovalRequest } = await seedConsentedMinorWithPendingReapproval();

    const realTransaction = db.transaction.bind(db);
    const transactionSpy = vi.spyOn(db, "transaction").mockImplementationOnce((callback: Parameters<typeof db.transaction>[0]) =>
      realTransaction(async (tx) => {
        const realUpdate = tx.update.bind(tx);
        let updateCalls = 0;
        const updateSpy = vi.spyOn(tx, "update").mockImplementation((table: Parameters<typeof tx.update>[0]) => {
          updateCalls++;
          if (updateCalls === 2) {
            updateSpy.mockRestore();
            throw new Error("simulated crash before the consent-record revocation commits");
          }
          return realUpdate(table);
        });
        return callback(tx);
      }),
    );

    await expect(
      declineReapprovalAndRefuseConsent({
        requestId: reapprovalRequest.id,
        userId: user.id,
        actorIp: "1.2.3.4",
        actorUserAgent: "test-agent",
      }),
    ).rejects.toThrow("simulated crash");
    transactionSpy.mockRestore();

    const [row] = await db
      .select()
      .from(legalReapprovalRequests)
      .where(eq(legalReapprovalRequests.id, reapprovalRequest.id));
    expect(row.status).toBe("pending");
    expect(row.usedAt).toBeNull();

    const [consentRecord] = await db.select().from(consentRecords).where(eq(consentRecords.userId, user.id));
    expect(consentRecord.status).toBe("consented"); // unchanged, never flipped to "refused"
  });
});

async function makeUserWithParentContact(weeklyReportOptIn = false) {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("weekly-report-opt-in"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
      email: null,
      dateOfBirth: "2015-01-01",
    })
    .returning();

  const [parentContact] = await db
    .insert(parentContacts)
    .values({ userId: user.id, name: "Priya", email: uniqueEmail("parent"), weeklyReportOptIn })
    .returning();

  return { user, parentContact };
}

describe("setParentContactWeeklyReportOptIn", () => {
  it("returns true and writes the value on a genuine change", async () => {
    const { user } = await makeUserWithParentContact(false);

    const changed = await setParentContactWeeklyReportOptIn(user.id, true);

    expect(changed).toBe(true);
    const [row] = await db.select().from(parentContacts).where(eq(parentContacts.userId, user.id));
    expect(row.weeklyReportOptIn).toBe(true);
  });

  it("returns false and writes nothing when the value is already what was asked for", async () => {
    const { user } = await makeUserWithParentContact(true);

    const changed = await setParentContactWeeklyReportOptIn(user.id, true);

    expect(changed).toBe(false);
  });
});

describe("unsubscribeParentContactFromWeeklyReport", () => {
  it("clears the opt-in and returns the row when it was on", async () => {
    const { user, parentContact } = await makeUserWithParentContact(true);

    const result = await unsubscribeParentContactFromWeeklyReport(parentContact.id);

    expect(result).not.toBeNull();
    const [row] = await db.select().from(parentContacts).where(eq(parentContacts.userId, user.id));
    expect(row.weeklyReportOptIn).toBe(false);
  });

  it("is idempotent - returns null (a no-op) when already off", async () => {
    const { parentContact } = await makeUserWithParentContact(false);

    const result = await unsubscribeParentContactFromWeeklyReport(parentContact.id);

    expect(result).toBeNull();
  });
});

describe("anonymizeParentContact", () => {
  it("clears weeklyReportOptIn and the unsubscribe token hash, same as the name/email", async () => {
    const { parentContact } = await makeUserWithParentContact(true);
    await db
      .update(parentContacts)
      .set({ weeklyReportUnsubscribeTokenHash: "some-live-hash" })
      .where(eq(parentContacts.id, parentContact.id));

    await anonymizeParentContact(parentContact.id);

    const [row] = await db.select().from(parentContacts).where(eq(parentContacts.id, parentContact.id));
    expect(row.name).toBe("[deleted]");
    expect(row.weeklyReportOptIn).toBe(false);
    expect(row.weeklyReportUnsubscribeTokenHash).toBeNull();
  });
});

describe("scrubParentContactDataTx", () => {
  it("anonymizes the contact, writes the HMAC, and stamps scrubbed_at - all in one go", async () => {
    const { user, parentContact } = await makeUserWithParentContact(true);
    await db.insert(consentRecords).values({
      userId: user.id,
      parentContactId: parentContact.id,
      status: "consented",
      tokenHash: `hash-${user.id}`,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await scrubParentContactDataTx({
      userId: user.id,
      parentContactId: parentContact.id,
      parentEmailHmac: "deterministic-hmac",
      anonymizeContact: true,
    });

    const [contactRow] = await db.select().from(parentContacts).where(eq(parentContacts.id, parentContact.id));
    expect(contactRow.name).toBe("[deleted]");
    expect(contactRow.email).toBe(`deleted+${parentContact.id}@anonymized.invalid`);
    expect(contactRow.weeklyReportOptIn).toBe(false);
    expect(contactRow.scrubbedAt).not.toBeNull();

    const [consentRow] = await db.select().from(consentRecords).where(eq(consentRecords.userId, user.id));
    expect(consentRow.parentEmailHmac).toBe("deterministic-hmac");
  });

  it("stamps scrubbed_at without touching name/email when anonymizeContact is false (a sibling still depends on it)", async () => {
    const { user, parentContact } = await makeUserWithParentContact(false);

    await scrubParentContactDataTx({
      userId: user.id,
      parentContactId: parentContact.id,
      parentEmailHmac: null,
      anonymizeContact: false,
    });

    const [contactRow] = await db.select().from(parentContacts).where(eq(parentContacts.id, parentContact.id));
    expect(contactRow.name).toBe("Priya");
    expect(contactRow.email).toBe(parentContact.email);
    expect(contactRow.scrubbedAt).not.toBeNull();
  });
});

describe("getParentContactByWeeklyReportUnsubscribeTokenHash", () => {
  it("finds the parent contact by its rotated unsubscribe token hash", async () => {
    const { user, parentContact } = await makeUserWithParentContact(true);
    await db
      .update(parentContacts)
      .set({ weeklyReportUnsubscribeTokenHash: "hash-for-" + user.id })
      .where(eq(parentContacts.id, parentContact.id));

    const found = await getParentContactByWeeklyReportUnsubscribeTokenHash("hash-for-" + user.id);

    expect(found?.id).toBe(parentContact.id);
  });

  it("returns null for an unknown hash", async () => {
    expect(await getParentContactByWeeklyReportUnsubscribeTokenHash("no-such-hash")).toBeNull();
  });
});

async function makeUserWithDateOfBirth(dateOfBirth: string | null = "2012-01-01") {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("dob-correction"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
      email: null,
      dateOfBirth,
    })
    .returning();
  return user;
}

describe("correctDateOfBirth", () => {
  it("updates users.dateOfBirth and writes the audit row in one go", async () => {
    const user = await makeUserWithDateOfBirth("2012-01-01");

    const result = await correctDateOfBirth(user.id, dobStaffId, "2011-06-15", "Parent provided correct birth certificate");

    expect(result).toEqual({
      oldDateOfBirth: "2012-01-01",
      newDateOfBirth: "2011-06-15",
      correctionId: expect.any(String),
    });

    const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(updatedUser.dateOfBirth).toBe("2011-06-15");

    const [correctionRow] = await db
      .select()
      .from(dobCorrections)
      .where(eq(dobCorrections.id, result!.correctionId));
    expect(correctionRow.userId).toBe(user.id);
    expect(correctionRow.staffId).toBe(dobStaffId);
    expect(correctionRow.oldDateOfBirth).toBe("2012-01-01");
    expect(correctionRow.newDateOfBirth).toBe("2011-06-15");
    expect(correctionRow.reason).toBe("Parent provided correct birth certificate");
  });

  it("returns null when the account has no date of birth set yet", async () => {
    const user = await makeUserWithDateOfBirth(null);

    const result = await correctDateOfBirth(user.id, dobStaffId, "2011-06-15", "any reason");

    expect(result).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.dateOfBirth).toBeNull();
  });

  it("returns null when the account is already deleted", async () => {
    const user = await makeUserWithDateOfBirth("2012-01-01");
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id));

    const result = await correctDateOfBirth(user.id, dobStaffId, "2011-06-15", "any reason");

    expect(result).toBeNull();
  });
});

describe("deleteDobCorrectionsForUser", () => {
  it("deletes every dob_corrections row for the user and returns the count", async () => {
    const user = await makeUserWithDateOfBirth("2012-01-01");
    await correctDateOfBirth(user.id, dobStaffId, "2011-06-15", "first correction");
    await correctDateOfBirth(user.id, dobStaffId, "2011-07-20", "second correction");

    const deletedCount = await deleteDobCorrectionsForUser(user.id);

    expect(deletedCount).toBe(2);
    const remaining = await db.select().from(dobCorrections).where(eq(dobCorrections.userId, user.id));
    expect(remaining).toHaveLength(0);
  });

  it("is a harmless no-op when there is nothing to delete", async () => {
    const user = await makeUserWithDateOfBirth("2012-01-01");

    expect(await deleteDobCorrectionsForUser(user.id)).toBe(0);
  });
});
