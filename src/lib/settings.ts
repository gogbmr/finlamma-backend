import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settingsKv } from "@/db/schema";

// Reads one settings_kv value, falling back to `fallback` if the key hasn't
// been seeded yet or its value isn't a number. Every domain that needs an
// admin-tunable numeric constant (see docs/DATA_MODEL.md's settings_kv
// entry) uses this instead of hardcoding the default inline, so seeding the
// real row later changes behavior with no code change.
export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const [row] = await db.select().from(settingsKv).where(eq(settingsKv.key, key)).limit(1);
  if (!row) return fallback;
  return typeof row.value === "number" ? row.value : fallback;
}
