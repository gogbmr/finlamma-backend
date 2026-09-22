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

// Same as getSettingNumber, but for a structured (object/array) value - e.g.
// Checkpoint 5b's lesson-flow scoring constants (src/server/settings). The
// caller validates the shape (e.g. via Zod safeParse) since this layer has
// no way to know what shape any given key holds.
export async function getSettingJson(key: string): Promise<unknown | null> {
  const [row] = await db.select().from(settingsKv).where(eq(settingsKv.key, key)).limit(1);
  return row?.value ?? null;
}

// Upserts a settings_kv row by key. Unlike scripts/seed-settings.ts's
// idempotent-on-value upsert (never overwrites an existing value), this DOES
// overwrite `value` - it's the write path for an actual admin-initiated
// change (src/server/settings/service.ts), not a seed script establishing a
// default.
export async function setSettingJson(
  key: string,
  value: unknown,
  description?: string,
): Promise<void> {
  await db
    .insert(settingsKv)
    .values({ key, value, description })
    .onConflictDoUpdate({
      target: settingsKv.key,
      set: { value, ...(description !== undefined ? { description } : {}) },
    });
}
