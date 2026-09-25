// One-off backfill for worlds.code (added in drizzle/0025_cool_whirlwind.sql,
// nullable so it doesn't retroactively break the 7 already-published worlds
// seeded by seed-worlds.ts - see docs/db/schema/worlds.ts's comment).
// validateWorldForPublish requires a code for any NEW publish from here on;
// this script exists purely to give the pre-existing seeded worlds one too,
// since their Boss Quizzes are already live and could be passed (issuing a
// certificate) at any time. Matches each seeded world's English title's
// initials - staff can change any of these later via the admin World editor.
// Safe to run again: only ever touches a row that currently has code IS NULL.
import "../envConfig";
import { eq, isNull } from "drizzle-orm";
import { db } from "../src/db/client";
import { worlds } from "../src/db/schema";

const CODES_BY_TITLE: Record<string, string> = {
  "Money World": "MW",
  "Savings Valley": "SV",
  "Budget Bazaar": "BB",
  "Market Maidan": "MM",
  "Risk Ridge": "RR",
  "Economy Empire": "EE",
  "Elite Summit": "ES",
};

async function main() {
  const rows = await db.select().from(worlds).where(isNull(worlds.code));
  for (const row of rows) {
    const code = CODES_BY_TITLE[row.title.en];
    if (!code) {
      console.warn(`No known code for world "${row.title.en}" (${row.id}) - skipping, set it manually via the admin editor`);
      continue;
    }
    await db.update(worlds).set({ code }).where(eq(worlds.id, row.id));
    console.log(`${row.title.en} -> ${code}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
