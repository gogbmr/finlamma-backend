// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real unique constraints (symbol, holiday date, the
// market_controls singleton) actually hold at the database level. Never
// touches the real Supabase database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  deleteMarketHolidayRow,
  getInstrumentById,
  getInstrumentBySymbol,
  getOrCreateMarketControls,
  insertInstrument,
  insertMarketHoliday,
  listActiveInstruments,
  listAllInstruments,
  listMarketHolidays,
  setInstrumentHalted,
  updateInstrumentRow,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

function uniqueSymbol(label: string) {
  return `${label.toUpperCase()}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

const ABOUT = { en: "en about", hi: "hi about", hx: "hx about" };
const TIP = { en: "en tip", hi: "hi tip", hx: "hx tip" };

function instrumentInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: uniqueSymbol("TST"),
    exchange: "NSE",
    name: "Test Co Ltd",
    sector: "Testing",
    about: ABOUT,
    tip: TIP,
    tags: ["Large cap"],
    mcap: null,
    pe: null,
    lotSize: 1,
    active: true,
    ...overrides,
  };
}

describe("insertInstrument / getInstrumentBySymbol", () => {
  it("creates an instrument and reads it back by symbol", async () => {
    const symbol = uniqueSymbol("ABC");
    await insertInstrument(instrumentInput({ symbol }));

    const found = await getInstrumentBySymbol(symbol);
    expect(found?.symbol).toBe(symbol);
    expect(found?.about.en).toBe("en about");
  });

  it("rejects a duplicate symbol", async () => {
    const symbol = uniqueSymbol("DUP");
    await insertInstrument(instrumentInput({ symbol }));
    await expect(insertInstrument(instrumentInput({ symbol }))).rejects.toThrow();
  });
});

describe("updateInstrumentRow", () => {
  it("updates an instrument's fields", async () => {
    const created = await insertInstrument(instrumentInput());
    const updated = await updateInstrumentRow({
      id: created.id,
      exchange: created.exchange,
      name: "Updated Name",
      sector: created.sector,
      about: created.about,
      tip: created.tip,
      tags: created.tags,
      mcap: 1_000_000,
      pe: 25.5,
      lotSize: created.lotSize,
      active: created.active,
    });
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.mcap).toBe(1_000_000);
    expect(updated?.pe).toBe(25.5);
  });

  it("returns null for a nonexistent instrument", async () => {
    const result = await updateInstrumentRow({
      id: randomUUID(),
      exchange: "NSE",
      name: "x",
      sector: "x",
      about: ABOUT,
      tip: TIP,
      tags: [],
      mcap: null,
      pe: null,
      lotSize: 1,
      active: true,
    });
    expect(result).toBeNull();
  });
});

describe("setInstrumentHalted / listActiveInstruments", () => {
  it("toggles the halted flag independently of active", async () => {
    const created = await insertInstrument(instrumentInput());
    const halted = await setInstrumentHalted(created.id, true);
    expect(halted?.halted).toBe(true);
    expect(halted?.active).toBe(true);
  });

  it("excludes inactive instruments from listActiveInstruments", async () => {
    const symbol = uniqueSymbol("INA");
    await insertInstrument(instrumentInput({ symbol, active: false }));

    const active = await listActiveInstruments();
    expect(active.some((i) => i.symbol === symbol)).toBe(false);

    const all = await listAllInstruments();
    expect(all.some((i) => i.symbol === symbol)).toBe(true);
  });
});

describe("getInstrumentById", () => {
  it("returns null for a nonexistent id", async () => {
    expect(await getInstrumentById(randomUUID())).toBeNull();
  });
});

describe("market holidays", () => {
  it("creates and lists a holiday", async () => {
    const date = "2031-01-26";
    await insertMarketHoliday({ date, name: "Republic Day" });

    const holidays = await listMarketHolidays();
    expect(holidays.some((h) => h.date === date && h.name === "Republic Day")).toBe(true);
  });

  it("rejects a duplicate date", async () => {
    const date = "2031-03-03";
    await insertMarketHoliday({ date, name: "Holi" });
    await expect(insertMarketHoliday({ date, name: "Holi (again)" })).rejects.toThrow();
  });

  it("deletes a holiday, returning null for a nonexistent id", async () => {
    const created = await insertMarketHoliday({ date: "2031-05-01", name: "Maharashtra Day" });
    const deleted = await deleteMarketHolidayRow(created.id);
    expect(deleted?.id).toBe(created.id);

    const result = await deleteMarketHolidayRow(created.id);
    expect(result).toBeNull();
  });
});

describe("getOrCreateMarketControls", () => {
  it("creates the singleton row on first read, with live/no-halt defaults", async () => {
    const controls = await getOrCreateMarketControls();
    expect(controls.feedMode).toBe("live");
    expect(controls.globalHalt).toBe(false);
  });

  it("returns the same row on a second read (never creates a second one)", async () => {
    const first = await getOrCreateMarketControls();
    const second = await getOrCreateMarketControls();
    expect(second.id).toBe(first.id);
  });
});
