// D25 (docs/ARCHITECTURE.md): mentors are a fully data-driven, unbounded
// content type - staff can create any number, and this script only seeds
// three (Baby/Father/Grandpa Lamma) as an initial, fully-editable starting
// point, not a fixed rule. Bios taken directly from the prototype's
// MENTOR_INFO (Finlamma App.dc.html ~line 5519) - see docs/FEATURE_MAP.md
// WH-09/WH-10. Unlike the legal-document seed, this content isn't gated on
// outside legal review, so it seeds as real (non-placeholder) published
// content - staff can freely rename, add to or delete this later through
// the admin Mentor editor. Which world(s) a mentor covers is never stored
// here - that assignment lives entirely on worlds.mentorId, set per world
// in the admin World editor (scripts/seed-worlds.ts).
//
// Refuses to touch a key that already exists, so this is safe to run again
// (e.g. against a fresh database) without overwriting staff edits.
// Run via `pnpm seed:mentors`.
import "../envConfig";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { mentors } from "../src/db/schema";
import { logActivity } from "../src/lib/activity-log";

const MENTORS = [
  {
    key: "baby",
    order: 1,
    persona:
      "Curious and gentle. Asks lots of clarifying questions, never judges a wrong answer, " +
      "explains from absolute zero. Keep replies short, warm and encouraging.",
    name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
    bio: {
      en: "The very first mentor - asks lots of questions and never judges. Starts from zero: " +
        "what money is, where it goes, and how to save it.",
      hi: "पहला मेंटर — बहुत सवाल पूछता है, कभी जज नहीं करता। बिल्कुल शुरुआत से सिखाता है: पैसा " +
        "क्या है, कहाँ जाता है, और कैसे बचाया जाता है।",
      hx: "Sabse pehla mentor - dher saara sawaal poochta hai, kabhi judge nahi karta. Basics " +
        "ekdum zero se shuru karta hai: paisa kya hai, kahan jaata hai, aur kaise bachta hai.",
    },
  },
  {
    key: "father",
    order: 2,
    persona:
      "Straightforward and strict. No excuses, focused on numbers, risk and discipline. " +
      "Talks like someone who expects the learner to already know the basics.",
    name: { en: "Father Lamma", hi: "फादर लामा", hx: "Father Lamma" },
    bio: {
      en: "The second mentor - straightforward and strict. Basics are done, now it's real " +
        "markets. Focused on numbers, risk and discipline, no excuses.",
      hi: "दूसरा मेंटर — सीधा और सख्त। अब बेसिक्स खत्म, असली मार्केट शुरू। नंबर्स, रिस्क और " +
        "अनुशासन पर फोकस करता है, बहाने नहीं सुनता।",
      hx: "Doosra mentor - seedha aur strict. Ab basics khatam, asli market shuru. Numbers, " +
        "risk aur discipline par focus karta hai, excuses nahi sunta.",
    },
  },
  {
    key: "grandpa",
    order: 3,
    persona:
      "Says little, but every word carries decades of experience. Calm, measured, speaks in " +
      "short wisdom-driven sentences rather than long explanations.",
    name: { en: "Grandpa Lamma", hi: "ग्रैंडपा लामा", hx: "Grandpa Lamma" },
    bio: {
      en: "The final mentor - says little, but carries 40 years of experience in every word. " +
        "Only 3% of users make it this far, and they learn the real game of long-term wealth.",
      hi: "आखिरी मेंटर — कम बोलता है, हर बात में 40 साल का अनुभव। सिर्फ 3% यूज़र्स यहाँ तक " +
        "पहुँचते हैं, और वही लॉन्ग-टर्म वेल्थ का असली खेल सीखते हैं।",
      hx: "Aakhri mentor - kam bolta hai, har baat mein 40 saal ka tajurba. Sirf 3% users " +
        "yahan tak pahunchte hain, aur wahi long-term wealth ka asli khel seekhte hain.",
    },
  },
] as const;

async function seed() {
  let createdCount = 0;

  for (const mentor of MENTORS) {
    const [existing] = await db.select().from(mentors).where(eq(mentors.key, mentor.key)).limit(1);
    if (existing) {
      console.log(`Skipping "${mentor.key}": already exists.`);
      continue;
    }

    const [created] = await db
      .insert(mentors)
      .values({
        key: mentor.key,
        order: mentor.order,
        name: mentor.name,
        bio: mentor.bio,
        persona: mentor.persona,
        status: "published",
        publishedAt: new Date(),
        // No staff actor - script-seeded, not a real staff publish action.
      })
      .returning();

    await logActivity({
      actorType: "system",
      action: "mentor.published",
      targetType: "mentor",
      targetId: created.id,
      metadata: { key: created.key, source: "seed-mentors" },
    });

    createdCount++;
    console.log(`Seeded mentor "${mentor.key}" (published).`);
  }

  console.log(`Done. ${createdCount} mentor(s) newly created.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
