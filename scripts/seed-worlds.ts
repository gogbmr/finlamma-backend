// D25 (docs/ARCHITECTURE.md): worlds are a fully data-driven, unbounded
// content type - staff decide how many exist. This script seeds 7 as an
// initial, fully-editable, reorderable and (if empty of lessons) deletable
// starting point, not a fixed rule - title/tagline taken directly from the
// prototype's WORLD_TEXT (Finlamma App.dc.html ~line 4961 - all three of
// en/hi/hx are fully authored there, unlike most prototype content which is
// Hinglish-only). Each world's mentorKey below is just this seed script's
// own starting assignment (staff can freely reassign any world's mentor
// afterward via the admin World editor's dropdown - the real relationship
// is worlds.mentorId, never a range stored on the mentor). `theme`
// (cosmetic accent hex color) and `displayXpTarget` (cosmetic only, see
// docs/DATA_MODEL.md) are best-effort values, not exact prototype extracts -
// staff can adjust either through the admin World editor.
//
// Refuses to touch an order that already has a world, so this is safe to
// run again (e.g. against a fresh database) without overwriting staff
// edits. Seeds as PUBLISHED (not legal text, no outside-review gate) - but
// only once its mentor is already published, since publishing enforces
// that dependency (see src/server/worlds/service.ts publishWorld). Run via
// `pnpm seed:worlds`.
import "../envConfig";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { mentors, worlds } from "../src/db/schema";
import { logActivity } from "../src/lib/activity-log";

const WORLDS = [
  {
    order: 1,
    mentorKey: "baby",
    theme: "#7C3AED",
    displayXpTarget: 5,
    title: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
    tagline: {
      en: "From barter to UPI — the whole story of money",
      hi: "बार्टर से UPI तक — पैसे की पूरी कहानी",
      hx: "Barter se UPI tak — paise ki poori kahani",
    },
  },
  {
    order: 2,
    mentorKey: "baby",
    theme: "#06B6D4",
    displayXpTarget: 12,
    title: { en: "Savings Valley", hi: "सेविंग्स वैली", hx: "Savings Valley" },
    tagline: {
      en: "Banks, interest and your first savings",
      hi: "बैंक, ब्याज और पहली बचत",
      hx: "Bank, byaaj aur pehli savings",
    },
  },
  {
    order: 3,
    mentorKey: "baby",
    theme: "#F59E0B",
    displayXpTarget: 20,
    title: { en: "Budget Bazaar", hi: "बजट बाज़ार", hx: "Budget Bazaar" },
    tagline: {
      en: "Budgets, bills and bargaining — 40 lessons",
      hi: "बजट, बिल और मोल-भाव — 40 लेसन",
      hx: "Budget, bill aur mol-bhaav — 40 lessons",
    },
  },
  {
    order: 4,
    mentorKey: "father",
    theme: "#3B82F6",
    displayXpTarget: 28,
    title: { en: "Market Maidan", hi: "मार्केट मैदान", hx: "Market Maidan" },
    tagline: {
      en: "Father Lamma waits here · live market sim",
      hi: "फादर लामा यहीं मिलेगा · लाइव मार्केट सिम",
      hx: "Father Lamma yahin milega · live market sim",
    },
  },
  {
    order: 5,
    mentorKey: "father",
    theme: "#EF4444",
    displayXpTarget: 32,
    title: { en: "Risk Ridge", hi: "रिस्क रिज", hx: "Risk Ridge" },
    tagline: {
      en: "Bull vs Bear — the hardest boss battle",
      hi: "बुल vs बेयर — सबसे मुश्किल बॉस बैटल",
      hx: "Bull vs Bear — sabse mushkil boss battle",
    },
  },
  {
    order: 6,
    mentorKey: "father",
    theme: "#A855F7",
    displayXpTarget: 40,
    title: { en: "Economy Empire", hi: "इकॉनमी एम्पायर", hx: "Economy Empire" },
    tagline: {
      en: "A whole country's economy in your hands",
      hi: "पूरे देश की इकॉनमी तुम्हारे हाथ में",
      hx: "Poore desh ki economy tumhare haath mein",
    },
  },
  {
    order: 7,
    mentorKey: "grandpa",
    theme: "#FBBF24",
    displayXpTarget: 50,
    title: { en: "Elite Summit", hi: "एलीट समिट", hx: "Elite Summit" },
    tagline: {
      en: "Grandpa Lamma · only 3% ever get here",
      hi: "ग्रैंडपा लामा · सिर्फ 3% यहाँ तक पहुँचते हैं",
      hx: "Grandpa Lamma · sirf 3% yahan tak pahunchte hain",
    },
  },
] as const;

async function seed() {
  const mentorRows = await db.select().from(mentors);
  const mentorIdByKey = new Map(mentorRows.map((m) => [m.key, m]));

  let createdCount = 0;

  for (const world of WORLDS) {
    const [existing] = await db.select().from(worlds).where(eq(worlds.order, world.order)).limit(1);
    if (existing) {
      console.log(`Skipping order ${world.order} ("${world.title.en}"): already exists.`);
      continue;
    }

    const mentor = mentorIdByKey.get(world.mentorKey);
    if (!mentor) {
      console.log(
        `Skipping order ${world.order} ("${world.title.en}"): mentor "${world.mentorKey}" not ` +
          "seeded yet - run `pnpm seed:mentors` first.",
      );
      continue;
    }
    if (mentor.status !== "published") {
      console.log(
        `Skipping order ${world.order} ("${world.title.en}"): mentor "${world.mentorKey}" isn't ` +
          "published yet.",
      );
      continue;
    }

    const [created] = await db
      .insert(worlds)
      .values({
        order: world.order,
        title: world.title,
        tagline: world.tagline,
        theme: world.theme,
        displayXpTarget: world.displayXpTarget,
        mentorId: mentor.id,
        status: "published",
        publishedAt: new Date(),
        // No staff actor - script-seeded, not a real staff publish action.
      })
      .returning();

    await logActivity({
      actorType: "system",
      action: "world.published",
      targetType: "world",
      targetId: created.id,
      metadata: { order: created.order, title: created.title.en, source: "seed-worlds" },
    });

    createdCount++;
    console.log(`Seeded world ${world.order} "${world.title.en}" (published).`);
  }

  console.log(`Done. ${createdCount} world(s) newly created.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
