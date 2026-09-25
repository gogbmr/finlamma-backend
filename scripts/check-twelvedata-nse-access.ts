// Throwaway diagnostic script - NOT part of the app, not imported anywhere.
// Answers one question directly from Twelve Data (more reliable than
// scraping their pricing page, which gave inconsistent results when
// researched for docs/ARCHITECTURE.md D38): does your API key's plan
// actually include NSE (India) quote/candle data, and if not, what does
// Twelve Data itself say you need to upgrade to?
//
// Usage:
//   TWELVEDATA_API_KEY=your_free_key npx tsx scripts/check-twelvedata-nse-access.ts
// or:
//   npx tsx scripts/check-twelvedata-nse-access.ts your_free_key
//
// Sign up for a free key (no card required) at https://twelvedata.com/pricing
// (the "Basic" plan) if you don't have one yet.

const apiKey = process.argv[2] ?? process.env.TWELVEDATA_API_KEY;

if (!apiKey) {
  console.error(
    "No API key provided. Pass it as an argument or set TWELVEDATA_API_KEY.\n" +
      "  TWELVEDATA_API_KEY=xxx npx tsx scripts/check-twelvedata-nse-access.ts",
  );
  process.exit(1);
}

async function checkEndpoint(label: string, url: string) {
  console.log(`\n--- ${label} ---`);
  console.log(url.replace(apiKey!, "<key>"));
  try {
    const res = await fetch(url);
    const body = await res.json();
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(body, null, 2));
    return body;
  } catch (err) {
    console.error("Request failed:", err);
    return null;
  }
}

async function main() {
  console.log("Checking Twelve Data NSE (India) access for your API key...");

  // A single live quote - cheapest possible real-data call, good first check.
  await checkEndpoint(
    "GET /quote (RELIANCE on NSE)",
    `https://api.twelvedata.com/quote?symbol=RELIANCE&exchange=NSE&apikey=${apiKey}`,
  );

  // Daily candle history - what Checkpoint 2's chart timeframes need.
  await checkEndpoint(
    "GET /time_series (RELIANCE on NSE, daily, last 5 bars)",
    `https://api.twelvedata.com/time_series?symbol=RELIANCE&exchange=NSE&interval=1day&outputsize=5&apikey=${apiKey}`,
  );

  console.log(
    "\nRead each response above. A real price/candle data means your plan already covers NSE. " +
      'An error mentioning your plan/subscription (e.g. "not available", "upgrade") names the ' +
      "exact tier Twelve Data says you need - that's the authoritative answer, not a guess.",
  );
}

main();
