// Seeds the 2026 NSE trading holiday calendar (source: NSE's published
// holiday list, cross-checked against calendarlabs.com/nse-market-holidays-2026
// on 2026-09-25). Idempotent by date - never overwrites an existing row on
// conflict, same reasoning as every other seed script in this file: once
// staff edit/correct a holiday via the admin editor, re-running this must
// not silently reset it. November 8 is Diwali-Laxmi Pujan - NSE's regular
// session is closed that day (a separate evening "Muhurat trading" session
// runs, which this app does not model), so it's seeded as a full holiday
// like every other date here. 2027's calendar wasn't published by NSE yet
// as of this seed's writing - add it via the admin editor once NSE releases
// it, no code change needed.
import "../envConfig";
import { db } from "../src/db/client";
import { marketHolidays } from "../src/db/schema";

const HOLIDAYS_2026 = [
  { date: "2026-01-26", name: "Republic Day" },
  { date: "2026-03-03", name: "Holi" },
  { date: "2026-03-26", name: "Ram Navami" },
  { date: "2026-03-31", name: "Mahavir Jayanti" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-14", name: "Dr. Baba Saheb Ambedkar Jayanti" },
  { date: "2026-05-01", name: "Maharashtra Day" },
  { date: "2026-05-28", name: "Bakri Id / Eid ul-Adha" },
  { date: "2026-06-26", name: "Muharram" },
  { date: "2026-09-14", name: "Ganesh Chaturthi" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2026-10-20", name: "Dasara" },
  { date: "2026-11-08", name: "Diwali - Laxmi Pujan" },
  { date: "2026-11-10", name: "Diwali - Balipratipada" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas" },
] as const;

async function seed() {
  for (const holiday of HOLIDAYS_2026) {
    await db.insert(marketHolidays).values(holiday).onConflictDoNothing({ target: marketHolidays.date });
  }
  console.log(
    `Seeded ${HOLIDAYS_2026.length} market holiday(s) for 2026 (existing rows, if any, were left untouched).`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
