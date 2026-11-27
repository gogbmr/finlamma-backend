// Data-loss guard for the Task 5a question-editor redesign - same reasoning
// as lessons/content-round-trip.test.ts: zodResolver's successful result is
// the schema's PARSED output, which silently strips any key a plain
// z.object() payload/answer schema doesn't declare. This simulates the
// exact load -> submit path for every one of the 7 question formats, using
// fixtures taken directly from src/server/questions/schemas.ts's own
// .openapi({example}) values (the canonical, realistic shape for each
// format) - not synthetic shapes invented for this test.
import { describe, expect, it } from "vitest";
import type { QuestionFormat } from "@/server/questions/schemas";
import {
  buildQuestionFormSchema,
  extractUnknownAnswerKeys,
  extractUnknownPayloadKeys,
} from "./question-content";

const FIXTURES: Record<QuestionFormat, { payload: Record<string, unknown>; answer: Record<string, unknown> }> = {
  single_select: {
    payload: {
      options: [
        { en: "Spend everything as soon as it arrives", hi: "जैसे ही पैसा आए, पूरा खर्च कर दें", hx: "Jaise hi paisa aaye, pura kharch kar do", icon: "💸" },
        { en: "Set aside a fixed % of income every month", hi: "हर महीने आय का एक तय % अलग रखें", hx: "Har mahine income ka ek fix % alag rakho" },
        { en: "Borrow money to buy stocks", hi: "स्टॉक खरीदने के लिए पैसे उधार लें", hx: "Stock kharidne ke liye paise udhaar lo" },
        { en: "Never check your bank balance", hi: "कभी भी बैंक बैलेंस न देखें", hx: "Kabhi bhi bank balance na dekho" },
      ],
      layout: "list",
    },
    answer: { correctIndex: 1 },
  },
  ordering: {
    payload: {
      pool: [
        { en: "Save or invest what's left over", hi: "जो बचे उसे बचाएं या निवेश करें", hx: "Jo bache use save ya invest karo" },
        { en: "List your monthly income", hi: "अपनी मासिक आय सूचीबद्ध करें", hx: "Apni monthly income list karo" },
        { en: "Subtract expenses from income", hi: "आय से खर्च घटाएं", hx: "Income se expenses minus karo" },
        { en: "List your monthly expenses", hi: "अपने मासिक खर्च सूचीबद्ध करें", hx: "Apne monthly expenses list karo" },
      ],
    },
    answer: { correctOrder: [1, 3, 2, 0] },
  },
  sort_buckets: {
    payload: {
      items: [
        { en: "Rent", hi: "किराया", hx: "Kiraya" },
        { en: "Stock dividends", hi: "स्टॉक डिविडेंड", hx: "Stock dividend" },
        { en: "Electricity bill", hi: "बिजली का बिल", hx: "Bijli ka bill" },
        { en: "Freelance income", hi: "फ्रीलांस आय", hx: "Freelance income" },
      ],
      buckets: [
        { en: "Expense", hi: "खर्च", hx: "Kharch" },
        { en: "Income", hi: "आय", hx: "Income" },
      ],
    },
    answer: { bucketByItemIndex: [0, 1, 0, 1] },
  },
  fill_blank: {
    payload: {
      sentenceParts: [
        { en: "A ", hi: "एक ", hx: "Ek " },
        { en: " is money set aside for emergencies.", hi: " आपातकाल के लिए अलग रखा गया पैसा है।", hx: " emergency ke liye alag rakha paisa hai." },
      ],
      pool: [
        { en: "budget", hi: "बजट", hx: "budget" },
        { en: "emergency fund", hi: "इमरजेंसी फंड", hx: "emergency fund" },
        { en: "loan", hi: "कर्ज़", hx: "loan" },
      ],
    },
    answer: { correctFillIndices: [1] },
  },
  match_pairs: {
    payload: {
      left: [
        { en: "SIP", hi: "एसआईपी", hx: "SIP" },
        { en: "NAV", hi: "एनएवी", hx: "NAV" },
        { en: "Diversification", hi: "विविधीकरण", hx: "Diversification" },
      ],
      right: [
        { en: "A fixed monthly investment plan", hi: "एक तय मासिक निवेश योजना", hx: "Ek fix monthly investment plan" },
        { en: "The per-unit value of a mutual fund", hi: "म्यूचुअल फंड की प्रति-यूनिट कीमत", hx: "Mutual fund ki per-unit value" },
        { en: "Spreading investments across asset types", hi: "निवेश को विभिन्न एसेट में फैलाना", hx: "Investment ko alag-alag asset types mein spread karna" },
      ],
    },
    answer: { rightIndexByLeftIndex: [2, 1, 0] },
  },
  spot_mistake: {
    payload: {
      lines: [
        { en: "Track your expenses every month.", hi: "हर महीने अपने खर्च पर नज़र रखें।", hx: "Har mahine apne expenses track karo." },
        { en: "Spend more than you earn to grow faster.", hi: "तेज़ी से बढ़ने के लिए कमाई से ज़्यादा खर्च करें।", hx: "Jaldi grow karne ke liye kamai se zyada kharch karo." },
        { en: "Save at least 20% of your income.", hi: "अपनी आय का कम से कम 20% बचाएं।", hx: "Apni income ka kam se kam 20% save karo." },
        { en: "Review your budget every quarter.", hi: "हर तीन महीने में अपना बजट जांचें।", hx: "Har teen mahine mein apna budget check karo." },
      ],
      lineSources: [
        null,
        { en: "RBI financial literacy guide", hi: "आरबीआई वित्तीय साक्षरता गाइड", hx: "RBI financial literacy guide" },
        null,
        null,
      ],
    },
    answer: { wrongLineIndex: 1 },
  },
  number_guess: {
    payload: {
      unit: { en: "Repo rate (%)", hi: "रेपो रेट (%)", hx: "Repo rate (%)" },
      min: 0,
      max: 15,
      step: 0.25,
    },
    answer: { correctValue: 6.5, tolerance: 0.5 },
  },
};

const FORMATS_UNDER_TEST = Object.keys(FIXTURES) as QuestionFormat[];

// Mirrors exactly what QuestionForm's onSaveDraft/onSaveHotfix do: load
// into RHF defaultValues, run the live zodResolver schema, then re-merge
// any passthrough keys the form itself never touched.
function simulateRoundTrip(
  format: QuestionFormat,
  payload: Record<string, unknown>,
  answer: Record<string, unknown>,
) {
  const unknownPayloadKeys = extractUnknownPayloadKeys(format, payload);
  const unknownAnswerKeys = extractUnknownAnswerKeys(format, answer);
  const parsed = buildQuestionFormSchema(format).parse({
    topicId: null,
    prompt: { en: "x", hi: "x", hx: "x" },
    explanation: { en: "x", hi: "x", hx: "x" },
    payload,
    answer,
  });
  return {
    payload: { ...unknownPayloadKeys, ...(parsed.payload as Record<string, unknown>) },
    answer: { ...unknownAnswerKeys, ...(parsed.answer as Record<string, unknown>) },
  };
}

describe("question payload/answer form round-trip (no data loss)", () => {
  for (const format of FORMATS_UNDER_TEST) {
    it(`${format}: payload and answer survive load -> submit unchanged`, () => {
      const { payload, answer } = FIXTURES[format];
      const result = simulateRoundTrip(format, payload, answer);
      expect(result.payload).toEqual(payload);
      expect(result.answer).toEqual(answer);
    });
  }

  it("preserves a payload key the form doesn't render an input for (future schema field)", () => {
    const payload = { ...FIXTURES.single_select.payload, experimentalLayout: "grid" };
    const result = simulateRoundTrip("single_select", payload, FIXTURES.single_select.answer);
    expect(result.payload.experimentalLayout).toBe("grid");
  });

  it("preserves an answer key the form doesn't render an input for (future schema field)", () => {
    const answer = { ...FIXTURES.single_select.answer, confidence: 0.9 };
    const result = simulateRoundTrip("single_select", FIXTURES.single_select.payload, answer);
    expect(result.answer.confidence).toBe(0.9);
  });
});
