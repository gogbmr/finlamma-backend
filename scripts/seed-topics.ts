// Seeds the topics catalog from the prototype's own TOPIC_MAP
// (Finlamma App.dc.html:7515) - RBI & rates, Afwah pehchano, Inflation,
// Market impact, Financial terms, Soch-samajh. Idempotent by order - never
// overwrites `name`/`active` on conflict, same reasoning as
// seed-reward-rules.ts: once staff have renamed or reordered a topic, this
// script running again must not silently reset it. Run via `pnpm seed:topics`.
import "../envConfig";
import { db } from "../src/db/client";
import { topics } from "../src/db/schema";

const TOPICS = [
  { order: 1, name: { en: "RBI & Rates", hi: "RBI aur dar", hx: "RBI & rates" } },
  { order: 2, name: { en: "Spot the Rumour", hi: "Afwah pehchano", hx: "Afwah pehchano" } },
  { order: 3, name: { en: "Inflation", hi: "Mehengai", hx: "Inflation" } },
  { order: 4, name: { en: "Market Impact", hi: "Market par asar", hx: "Market impact" } },
  { order: 5, name: { en: "Financial Terms", hi: "Vittiya shabd", hx: "Financial terms" } },
  { order: 6, name: { en: "Reasoning", hi: "Soch-samajh", hx: "Soch-samajh" } },
] as const;

async function seed() {
  for (const topic of TOPICS) {
    await db
      .insert(topics)
      .values({ ...topic, active: true })
      .onConflictDoNothing({ target: topics.order });
  }
  console.log(`Seeded ${TOPICS.length} topic(s) (existing rows, if any, were left untouched).`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
