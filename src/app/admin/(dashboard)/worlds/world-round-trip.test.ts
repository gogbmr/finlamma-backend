// Data-loss/rejection guard for the Task 5b world-editor redesign - same
// reasoning as mentors/mentor-round-trip.test.ts: worlds have no jsonb
// content blob either, every field is a fixed named column
// (src/server/worlds/repo.ts), so there's no "unknown key" to silently
// strip. This simulates the load -> submit path against all 7 real worlds
// currently in the dev DB (read-only query against `worlds`), through the
// exact schemas the editor's resolver uses (reused directly from
// src/server/worlds/schemas.ts, never a copy).
import { describe, expect, it } from "vitest";
import { HotfixWorldSchema, UpdateWorldDraftSchema } from "@/server/worlds/schemas";

type Row = {
  id: string;
  order: number;
  code: string | null;
  title: { en: string; hi: string; hx: string };
  tagline: { en: string; hi: string; hx: string };
  theme: string;
  display_xp_target: number;
  mentor_id: string;
};

// Pasted verbatim from a read-only Supabase query against the live
// `worlds` table - all 7 real rows currently there.
const ROWS: Row[] = [
  { id: "4c5d33fe-e2ce-4f72-9b24-616d37d99486", order: 1, code: "MW", title: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" }, tagline: { en: "From barter to UPI — the whole story of money", hi: "बार्टर से UPI तक — पैसे की पूरी कहानी", hx: "Barter se UPI tak — paise ki poori kahani" }, theme: "#7C3AED", display_xp_target: 5, mentor_id: "6148f749-29d1-449d-a601-aa903bb1b3d7" },
  { id: "f1f8fbce-3645-4361-b0c2-51c0b79b268c", order: 2, code: "SV", title: { en: "Savings Valley", hi: "सेविंग्स वैली", hx: "Savings Valley" }, tagline: { en: "Banks, interest and your first savings", hi: "बैंक, ब्याज और पहली बचत", hx: "Bank, byaaj aur pehli savings" }, theme: "#06B6D4", display_xp_target: 12, mentor_id: "6148f749-29d1-449d-a601-aa903bb1b3d7" },
  { id: "2863db60-bede-4735-85ea-657905a2a25c", order: 3, code: "BB", title: { en: "Budget Bazaar", hi: "बजट बाज़ार", hx: "Budget Bazaar" }, tagline: { en: "Budgets, bills and bargaining — 40 lessons", hi: "बजट, बिल और मोल-भाव — 40 लेसन", hx: "Budget, bill aur mol-bhaav — 40 lessons" }, theme: "#F59E0B", display_xp_target: 20, mentor_id: "6148f749-29d1-449d-a601-aa903bb1b3d7" },
  { id: "e1310342-7412-464e-9ca8-e582d910a076", order: 4, code: "MM", title: { en: "Market Maidan", hi: "मार्केट मैदान", hx: "Market Maidan" }, tagline: { en: "Father Lamma waits here · live market sim", hi: "फादर लामा यहीं मिलेगा · लाइव मार्केट सिम", hx: "Father Lamma yahin milega · live market sim" }, theme: "#3B82F6", display_xp_target: 28, mentor_id: "f5567ba0-a14f-49ba-b3c3-0e40e6f88ad5" },
  { id: "49a75455-0707-4d2e-8a58-d3c4b1843697", order: 5, code: "RR", title: { en: "Risk Ridge", hi: "रिस्क रिज", hx: "Risk Ridge" }, tagline: { en: "Bull vs Bear — the hardest boss battle", hi: "बुल vs बेयर — सबसे मुश्किल बॉस बैटल", hx: "Bull vs Bear — sabse mushkil boss battle" }, theme: "#EF4444", display_xp_target: 32, mentor_id: "f5567ba0-a14f-49ba-b3c3-0e40e6f88ad5" },
  { id: "d12219a4-660f-41fc-8794-d02a70e414a7", order: 6, code: "EE", title: { en: "Economy Empire", hi: "इकॉनमी एम्पायर", hx: "Economy Empire" }, tagline: { en: "A whole country's economy in your hands", hi: "पूरे देश की इकॉनमी तुम्हारे हाथ में", hx: "Poore desh ki economy tumhare haath mein" }, theme: "#A855F7", display_xp_target: 40, mentor_id: "f5567ba0-a14f-49ba-b3c3-0e40e6f88ad5" },
  { id: "e3005add-2049-418b-af46-f1fd4b4bd2e0", order: 7, code: "ES", title: { en: "Elite Summit", hi: "एलीट समिट", hx: "Elite Summit" }, tagline: { en: "Grandpa Lamma · only 3% ever get here", hi: "ग्रैंडपा लामा · सिर्फ 3% यहाँ तक पहुँचते हैं", hx: "Grandpa Lamma · sirf 3% yahan tak pahunchte hain" }, theme: "#FBBF24", display_xp_target: 50, mentor_id: "e445aa4f-6c73-439b-9efd-a2e1a186813b" },
];

describe("world editor form round-trip against real worlds (no data loss)", () => {
  for (const row of ROWS) {
    it(`${row.id}: UpdateWorldDraftSchema preserves every field unchanged`, () => {
      const parsed = UpdateWorldDraftSchema.parse({
        id: row.id,
        order: row.order,
        code: row.code,
        title: row.title,
        tagline: row.tagline,
        theme: row.theme,
        displayXpTarget: row.display_xp_target,
        mentorId: row.mentor_id,
      });
      expect(parsed).toEqual({
        id: row.id,
        order: row.order,
        code: row.code,
        title: row.title,
        tagline: row.tagline,
        theme: row.theme,
        displayXpTarget: row.display_xp_target,
        mentorId: row.mentor_id,
      });
    });

    it(`${row.id}: HotfixWorldSchema (published-world save path) preserves title/tagline unchanged`, () => {
      const parsed = HotfixWorldSchema.parse({ id: row.id, title: row.title, tagline: row.tagline });
      expect(parsed).toEqual({ id: row.id, title: row.title, tagline: row.tagline });
    });
  }
});
