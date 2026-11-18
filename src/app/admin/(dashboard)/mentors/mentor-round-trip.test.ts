// Data-loss/rejection guard for the Task 5b mentor-editor redesign. Unlike
// lessons/questions, mentors have no jsonb content blob - every field the
// editor touches (order, name, bio, persona) is a fixed, named column
// (src/server/mentors/repo.ts always selects an explicit column list), so
// there is no "unknown key the form doesn't know about" to silently strip
// the way lessons' content/questions' payload could. The real risk here is
// narrower: does the exact schema the editor's resolver uses (reused
// directly from src/server/mentors/schemas.ts, never a copy) actually
// accept every real row, and does every field survive unchanged? This
// simulates the load -> submit path against all 3 real mentors currently
// in the dev DB (read-only query against `mentors`).
import { describe, expect, it } from "vitest";
import { HotfixMentorSchema, UpdateMentorDraftSchema } from "@/server/mentors/schemas";

type Row = {
  id: string;
  order: number;
  name: { en: string; hi: string; hx: string };
  bio: { en: string; hi: string; hx: string };
  persona: string;
};

// Pasted verbatim from a read-only Supabase query against the live
// `mentors` table - all 3 real rows currently there.
const ROWS: Row[] = [
  {
    id: "6148f749-29d1-449d-a601-aa903bb1b3d7",
    order: 1,
    name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
    bio: {
      en: "The very first mentor - asks lots of questions and never judges. Starts from zero: what money is, where it goes, and how to save it.",
      hi: "पहला मेंटर — बहुत सवाल पूछता है, कभी जज नहीं करता। बिल्कुल शुरुआत से सिखाता है: पैसा क्या है, कहाँ जाता है, और कैसे बचाया जाता है।",
      hx: "Sabse pehla mentor - dher saara sawaal poochta hai, kabhi judge nahi karta. Basics ekdum zero se shuru karta hai: paisa kya hai, kahan jaata hai, aur kaise bachta hai.",
    },
    persona: "",
  },
  {
    id: "f5567ba0-a14f-49ba-b3c3-0e40e6f88ad5",
    order: 2,
    name: { en: "Father Lamma", hi: "फादर लामा", hx: "Father Lamma" },
    bio: {
      en: "The second mentor - straightforward and strict. Basics are done, now it's real markets. Focused on numbers, risk and discipline, no excuses.",
      hi: "दूसरा मेंटर — सीधा और सख्त। अब बेसिक्स खत्म, असली मार्केट शुरू। नंबर्स, रिस्क और अनुशासन पर फोकस करता है, बहाने नहीं सुनता।",
      hx: "Doosra mentor - seedha aur strict. Ab basics khatam, asli market shuru. Numbers, risk aur discipline par focus karta hai, excuses nahi sunta.",
    },
    persona: "",
  },
  {
    id: "e445aa4f-6c73-439b-9efd-a2e1a186813b",
    order: 3,
    name: { en: "Grandpa Lamma", hi: "ग्रैंडपा लामा", hx: "Grandpa Lamma" },
    bio: {
      en: "The final mentor - says little, but carries 40 years of experience in every word. Only 3% of users make it this far, and they learn the real game of long-term wealth.",
      hi: "आखिरी मेंटर — कम बोलता है, हर बात में 40 साल का अनुभव। सिर्फ 3% यूज़र्स यहाँ तक पहुँचते हैं, और वही लॉन्ग-टर्म वेल्थ का असली खेल सीखते हैं।",
      hx: "Aakhri mentor - kam bolta hai, har baat mein 40 saal ka tajurba. Sirf 3% users yahan tak pahunchte hain, aur wahi long-term wealth ka asli khel seekhte hain.",
    },
    persona: "",
  },
];

describe("mentor editor form round-trip against real mentors (no data loss)", () => {
  for (const row of ROWS) {
    it(`${row.id}: UpdateMentorDraftSchema preserves every field unchanged`, () => {
      const parsed = UpdateMentorDraftSchema.parse({
        id: row.id,
        order: row.order,
        name: row.name,
        bio: row.bio,
        persona: row.persona,
      });
      expect(parsed).toEqual({ id: row.id, order: row.order, name: row.name, bio: row.bio, persona: row.persona });
    });

    it(`${row.id}: HotfixMentorSchema (published-mentor save path) preserves name/bio unchanged`, () => {
      const parsed = HotfixMentorSchema.parse({ id: row.id, name: row.name, bio: row.bio });
      expect(parsed).toEqual({ id: row.id, name: row.name, bio: row.bio });
    });
  }
});
