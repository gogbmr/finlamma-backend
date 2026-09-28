// Deterministic fixture headlines - same reasoning as
// src/server/market/providers/mock.ts (D38/D39): lets the whole ingestion
// -> drafting -> review -> Pulse Check pipeline be built and tested with
// zero vendor cost while D50 (docs/ARCHITECTURE.md) blocks a real news
// vendor. Auto-selected whenever no real news API key is configured - see
// getNewsProviderKind()/getNewsProvider() in ./index.ts.
//
// Fixed, never randomized or time-varying - a deterministic fixture set is
// what makes ingestion idempotency (news_raw's (source, externalId) unique
// index) and drafting tests reproducible run to run.
export type RawNewsItem = {
  externalId: string;
  url: string;
  headline: string;
  summary: string;
  publishedAt: Date;
};

const FIXED_PUBLISHED_AT = new Date("2026-09-28T04:00:00.000Z"); // ~09:30 IST

const MOCK_ITEMS: RawNewsItem[] = [
  {
    externalId: "mock-rbi-repo-hold",
    url: "https://example.com/mock/rbi-repo-hold",
    headline: "RBI holds repo rate at 5.50% for third straight policy",
    summary:
      "The Reserve Bank of India's Monetary Policy Committee kept the repo rate unchanged at 5.50%, citing balanced growth and inflation risks.",
    publishedAt: FIXED_PUBLISHED_AT,
  },
  {
    externalId: "mock-cpi-inflation-easing",
    url: "https://example.com/mock/cpi-inflation-easing",
    headline: "Retail inflation eases to 3.8%, a six-month low",
    summary:
      "India's CPI inflation cooled to 3.8% year-on-year, helped by lower vegetable and pulses prices, government data showed.",
    publishedAt: FIXED_PUBLISHED_AT,
  },
  {
    externalId: "mock-nifty-record-close",
    url: "https://example.com/mock/nifty-record-close",
    headline: "Nifty 50 closes above 24,800 for the first time",
    summary:
      "The Nifty 50 index closed at a record high, led by gains in banking and IT stocks, as foreign investors continued buying.",
    publishedAt: FIXED_PUBLISHED_AT,
  },
  {
    externalId: "mock-tcs-europe-deal",
    url: "https://example.com/mock/tcs-europe-deal",
    headline: "TCS wins ₹18,000 crore multi-year deal in Europe",
    summary:
      "Tata Consultancy Services announced a large multi-year technology services contract with a European banking group.",
    publishedAt: FIXED_PUBLISHED_AT,
  },
  {
    externalId: "mock-ev-maker-ipo-filing",
    url: "https://example.com/mock/ev-maker-ipo-filing",
    headline: "EV maker files draft papers for ₹4,200 crore IPO",
    summary:
      "An electric-vehicle manufacturer filed preliminary papers with SEBI for an initial public offering to fund factory expansion.",
    publishedAt: FIXED_PUBLISHED_AT,
  },
  {
    externalId: "mock-auto-gst-rumour",
    url: "https://example.com/mock/auto-gst-rumour",
    headline: "Auto stocks slip 2% on unverified GST hike chatter",
    summary:
      "Shares of auto manufacturers fell after social media speculation about a GST increase on vehicles; no official announcement was made.",
    publishedAt: FIXED_PUBLISHED_AT,
  },
];

export class MockNewsProvider {
  async fetchLatest(): Promise<RawNewsItem[]> {
    return MOCK_ITEMS;
  }
}
