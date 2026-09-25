import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteMarketHolidayRow = vi.fn();
const mockGetInstrumentById = vi.fn();
const mockGetOrCreateMarketControls = vi.fn();
const mockInsertInstrument = vi.fn();
const mockInsertMarketHoliday = vi.fn();
const mockListAllInstruments = vi.fn();
const mockListMarketHolidays = vi.fn();
const mockUpdateInstrumentRow = vi.fn();
vi.mock("./repo", () => ({
  deleteMarketHolidayRow: (id: unknown) => mockDeleteMarketHolidayRow(id),
  getInstrumentById: (id: unknown) => mockGetInstrumentById(id),
  getOrCreateMarketControls: () => mockGetOrCreateMarketControls(),
  insertInstrument: (input: unknown) => mockInsertInstrument(input),
  insertMarketHoliday: (input: unknown) => mockInsertMarketHoliday(input),
  listAllInstruments: () => mockListAllInstruments(),
  listMarketHolidays: () => mockListMarketHolidays(),
  updateInstrumentRow: (input: unknown) => mockUpdateInstrumentRow(input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  createInstrument,
  createMarketHoliday,
  deleteMarketHoliday,
  getInstrumentEditorData,
  getMarketControls,
  getMarketHolidayEditorData,
  updateInstrument,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };

function instrumentInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: "RELIANCE",
    exchange: "NSE",
    name: "Reliance Industries Ltd",
    sector: "Oil & Gas",
    about: { en: "a", hi: "a", hx: "a" },
    tip: { en: "t", hi: "t", hx: "t" },
    tags: ["Large cap"],
    mcap: null,
    pe: null,
    lotSize: 1,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createInstrument", () => {
  it("creates and logs the activity", async () => {
    const created = { id: "inst_1", symbol: "RELIANCE", name: "Reliance Industries Ltd" };
    mockInsertInstrument.mockResolvedValue(created);

    const result = await createInstrument(ACTOR, instrumentInput(), META);

    expect(result).toBe(created);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "instrument.created", targetId: "inst_1" }),
    );
  });

  it("maps a duplicate symbol to a clean CONFLICT", async () => {
    mockInsertInstrument.mockRejectedValue(
      Object.assign(new Error("duplicate"), { cause: { code: "23505" } }),
    );

    await expect(createInstrument(ACTOR, instrumentInput({ symbol: "DUP" }), META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("updateInstrument", () => {
  it("throws NOT_FOUND when the instrument doesn't exist", async () => {
    mockGetInstrumentById.mockResolvedValue(null);

    await expect(
      updateInstrument(ACTOR, { id: "missing", ...instrumentInput() } as never, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUpdateInstrumentRow).not.toHaveBeenCalled();
  });

  it("updates and logs the activity", async () => {
    const existing = { id: "inst_1", symbol: "RELIANCE" };
    const updated = { id: "inst_1", symbol: "RELIANCE", name: "New Name" };
    mockGetInstrumentById.mockResolvedValue(existing);
    mockUpdateInstrumentRow.mockResolvedValue(updated);

    const result = await updateInstrument(ACTOR, { id: "inst_1", ...instrumentInput() } as never, META);

    expect(result).toBe(updated);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "instrument.updated", targetId: "inst_1" }),
    );
  });
});

describe("getInstrumentEditorData", () => {
  it("delegates to listAllInstruments", async () => {
    mockListAllInstruments.mockResolvedValue([{ id: "inst_1" }]);
    const result = await getInstrumentEditorData();
    expect(result).toEqual([{ id: "inst_1" }]);
  });
});

describe("createMarketHoliday", () => {
  it("creates and logs the activity", async () => {
    const created = { id: "hol_1", date: "2026-10-02", name: "Mahatma Gandhi Jayanti" };
    mockInsertMarketHoliday.mockResolvedValue(created);

    const result = await createMarketHoliday(ACTOR, { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" }, META);

    expect(result).toBe(created);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "market_holiday.created", targetId: "hol_1" }),
    );
  });

  it("maps a duplicate date to a clean CONFLICT", async () => {
    mockInsertMarketHoliday.mockRejectedValue(
      Object.assign(new Error("duplicate"), { cause: { code: "23505" } }),
    );

    await expect(
      createMarketHoliday(ACTOR, { date: "2026-10-02", name: "x" }, META),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("deleteMarketHoliday", () => {
  it("throws NOT_FOUND when the holiday doesn't exist", async () => {
    mockDeleteMarketHolidayRow.mockResolvedValue(null);
    await expect(deleteMarketHoliday(ACTOR, "missing", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes and logs the activity", async () => {
    const deleted = { id: "hol_1", date: "2026-10-02", name: "Mahatma Gandhi Jayanti" };
    mockDeleteMarketHolidayRow.mockResolvedValue(deleted);

    const result = await deleteMarketHoliday(ACTOR, "hol_1", META);

    expect(result).toBe(deleted);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "market_holiday.deleted", targetId: "hol_1" }),
    );
  });
});

describe("getMarketHolidayEditorData", () => {
  it("delegates to listMarketHolidays", async () => {
    mockListMarketHolidays.mockResolvedValue([{ id: "hol_1" }]);
    const result = await getMarketHolidayEditorData();
    expect(result).toEqual([{ id: "hol_1" }]);
  });
});

describe("getMarketControls", () => {
  it("delegates to getOrCreateMarketControls", async () => {
    const controls = { id: "singleton", feedMode: "live", globalHalt: false };
    mockGetOrCreateMarketControls.mockResolvedValue(controls);
    const result = await getMarketControls();
    expect(result).toBe(controls);
  });
});
