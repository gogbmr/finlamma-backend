// Seeds version 1 of each legal document (terms, privacy, risk_disclosure)
// as PUBLISHED, so the app and the parental-consent flow have something
// real to show and record acceptance against end-to-end. The content
// itself is a clearly marked DRAFT placeholder - see
// docs/PRODUCT_SPEC.md's Onboarding & parental consent section and
// docs/ROADMAP.md's pre-launch checklist: the real text comes after an
// outside legal review, at which point staff drafts and publishes a real
// version 2+ through the admin Legal document editor (never by re-running
// this script).
//
// Refuses to touch a type that already has a published version, so this is
// safe to run again (e.g. against a fresh database) without ever
// overwriting real legal text with the placeholder. Run via `pnpm seed:legal`.
import "../envConfig";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { legalDocuments } from "../src/db/schema";
import { logActivity } from "../src/lib/activity-log";

const PLACEHOLDER_NOTICE =
  "[PLACEHOLDER — NOT FOR LAUNCH. Not reviewed by counsel. Do not treat as final legal text.]";

const DOCUMENTS = [
  {
    type: "terms" as const,
    content: {
      en: `${PLACEHOLDER_NOTICE} Terms of use for Finlamma, a financial-literacy app for students. Educational only - nothing here is investment advice, and no real money is ever involved.`,
      hi: `${PLACEHOLDER_NOTICE} Finlamma ke upyog ki sharten - ek financial-literacy app chatron ke liye. Sirf shaikshik - yah nivesh salaah nahi hai, aur kabhi bhi asli paisa shaamil nahi hota.`,
      hx: `${PLACEHOLDER_NOTICE} Finlamma use karne ke terms - students ke liye ek financial-literacy app. Sirf educational hai - yeh investment advice nahi hai, aur kabhi real paisa involve nahi hota.`,
    },
  },
  {
    type: "privacy" as const,
    content: {
      en: `${PLACEHOLDER_NOTICE} Privacy policy for Finlamma. Describes what data we collect (including a parent/guardian's email for under-18 consent) and how it's used.`,
      hi: `${PLACEHOLDER_NOTICE} Finlamma ki gopniyata niti. Hum kaunsa data ekatrit karte hain (18 saal se kam umra walon ke liye माता-पिता/अभिभावक ka email sameet) aur use kaise upyog karte hain.`,
      hx: `${PLACEHOLDER_NOTICE} Finlamma ki privacy policy. Hum kaunsa data collect karte hain (under-18 consent ke liye parent/guardian ka email bhi) aur use kaise use karte hain.`,
    },
  },
  {
    type: "risk_disclosure" as const,
    content: {
      en: `${PLACEHOLDER_NOTICE} Risk disclosure: Finlamma is not a SEBI-registered investment adviser. All trading in the app uses virtual "V Money" only - no real money, no real orders, ever.`,
      hi: `${PLACEHOLDER_NOTICE} Jokhim prakatikaran: Finlamma ek SEBI-panjikrit nivesh salaahkaar nahi hai. App mein sabhi trading sirf virtual "V Money" se hoti hai - kabhi asli paisa ya asli order nahi.`,
      hx: `${PLACEHOLDER_NOTICE} Risk disclosure: Finlamma SEBI-registered investment adviser nahi hai. App mein saari trading sirf virtual "V Money" se hoti hai - kabhi real paisa ya real order nahi.`,
    },
  },
];

async function seed() {
  let createdCount = 0;

  for (const doc of DOCUMENTS) {
    const [existingPublished] = await db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.type, doc.type), eq(legalDocuments.status, "published")))
      .orderBy(desc(legalDocuments.version))
      .limit(1);

    if (existingPublished) {
      console.log(`Skipping ${doc.type}: already has a published version (v${existingPublished.version}).`);
      continue;
    }

    const [created] = await db
      .insert(legalDocuments)
      .values({
        type: doc.type,
        version: 1,
        content: doc.content,
        status: "published",
        publishedAt: new Date(),
        isPlaceholder: true,
        // No staff actor - this is a script-seeded placeholder, not a real
        // staff publish action. publishedBy stays null (nullable column).
      })
      .returning();

    await logActivity({
      actorType: "system",
      action: "legal.published_placeholder",
      targetType: "legal_document",
      targetId: created.id,
      metadata: { type: doc.type, version: created.version, source: "seed-legal-documents" },
    });

    createdCount++;
    console.log(`Seeded ${doc.type} v1 (DRAFT placeholder content, published).`);
  }

  console.log(`Done. ${createdCount} document(s) newly published.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
