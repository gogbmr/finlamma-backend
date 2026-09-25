import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { instruments, marketHolidays, marketControls, MARKET_CONTROLS_SINGLETON_ID } from "@/db/schema";
import type {
  CreateInstrumentInput,
  CreateMarketHolidayInput,
  UpdateInstrumentInput,
} from "./schemas";

// --- Instruments ---

export async function listAllInstruments() {
  return db.select().from(instruments).orderBy(asc(instruments.symbol));
}

export async function listActiveInstruments() {
  return db.select().from(instruments).where(eq(instruments.active, true)).orderBy(asc(instruments.symbol));
}

export async function getInstrumentById(id: string) {
  const [row] = await db.select().from(instruments).where(eq(instruments.id, id)).limit(1);
  return row ?? null;
}

export async function getInstrumentBySymbol(symbol: string) {
  const [row] = await db.select().from(instruments).where(eq(instruments.symbol, symbol)).limit(1);
  return row ?? null;
}

export async function insertInstrument(input: CreateInstrumentInput) {
  const [row] = await db.insert(instruments).values(input).returning();
  return row;
}

export async function updateInstrumentRow(input: UpdateInstrumentInput) {
  const { id, ...rest } = input;
  const [row] = await db.update(instruments).set(rest).where(eq(instruments.id, id)).returning();
  return row ?? null;
}

// Ops console only (Checkpoint 9, trading.ops permission) - separate from
// the catalog fields above (instrument.manage), since halting a symbol is a
// live trading-safety control, not catalog editing. Kept here now so the
// column has a real write path the moment Checkpoint 9 needs it, even
// though nothing calls it yet.
export async function setInstrumentHalted(id: string, halted: boolean) {
  const [row] = await db.update(instruments).set({ halted }).where(eq(instruments.id, id)).returning();
  return row ?? null;
}

// --- Market holidays ---

export async function listMarketHolidays() {
  return db.select().from(marketHolidays).orderBy(asc(marketHolidays.date));
}

export async function insertMarketHoliday(input: CreateMarketHolidayInput) {
  const [row] = await db.insert(marketHolidays).values(input).returning();
  return row;
}

export async function deleteMarketHolidayRow(id: string) {
  const [row] = await db.delete(marketHolidays).where(eq(marketHolidays.id, id)).returning();
  return row ?? null;
}

// --- Market controls (singleton row, Ops console - Checkpoint 3/9) ---

// Self-healing: creates the singleton row with its column defaults (live
// feed, no halt) the first time anything reads it, rather than requiring a
// seed script to have run first - a fresh environment (a new preview
// database, a test DB) just works without an extra setup step.
export async function getOrCreateMarketControls() {
  const [existing] = await db.select().from(marketControls).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(marketControls)
    .values({ id: MARKET_CONTROLS_SINGLETON_ID })
    .onConflictDoNothing({ target: marketControls.id })
    .returning();
  if (created) return created;
  // Lost a race against a concurrent first-read - the other insert won, so
  // read what it wrote.
  const [row] = await db.select().from(marketControls).limit(1);
  return row!;
}
