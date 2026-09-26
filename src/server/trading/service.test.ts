import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteMarketHolidayRow = vi.fn();
const mockGetInstrumentById = vi.fn();
const mockGetOrCreateMarketControls = vi.fn();
const mockInsertInstrument = vi.fn();
const mockInsertMarketHoliday = vi.fn();
const mockListAllInstruments = vi.fn();
const mockListMarketHolidays = vi.fn();
const mockUpdateInstrumentRow = vi.fn();
const mockSetGlobalHalt = vi.fn();
const mockSetFeedMode = vi.fn();
const mockSetInstrumentHalted = vi.fn();
vi.mock("./repo", () => ({
  deleteMarketHolidayRow: (id: unknown) => mockDeleteMarketHolidayRow(id),
  getInstrumentById: (id: unknown) => mockGetInstrumentById(id),
  getOrCreateMarketControls: () => mockGetOrCreateMarketControls(),
  insertInstrument: (input: unknown) => mockInsertInstrument(input),
  insertMarketHoliday: (input: unknown) => mockInsertMarketHoliday(input),
  listAllInstruments: () => mockListAllInstruments(),
  listMarketHolidays: () => mockListMarketHolidays(),
  updateInstrumentRow: (input: unknown) => mockUpdateInstrumentRow(input),
  setGlobalHalt: (halt: unknown) => mockSetGlobalHalt(halt),
  setFeedMode: (mode: unknown) => mockSetFeedMode(mode),
  setInstrumentHalted: (id: unknown, halted: unknown) => mockSetInstrumentHalted(id, halted),
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
  updateFeedMode,
  updateGlobalHalt,
  updateInstrument,
  updateInstrumentHalted,
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

describe("updateGlobalHalt", () => {
  it("halts and logs ops.global_halt_enabled with the reason", async () => {
    const updated = { id: "singleton", feedMode: "live", globalHalt: true };
    mockSetGlobalHalt.mockResolvedValue(updated);

    const result = await updateGlobalHalt(ACTOR, true, "Suspicious price feed - pausing to investigate", META);

    expect(result).toBe(updated);
    expect(mockSetGlobalHalt).toHaveBeenCalledWith(true);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorId: "staff_1",
        action: "ops.global_halt_enabled",
        targetType: "market_controls",
        metadata: { reason: "Suspicious price feed - pausing to investigate" },
      }),
    );
  });

  it("unhalts and logs ops.global_halt_disabled", async () => {
    mockSetGlobalHalt.mockResolvedValue({ id: "singleton", feedMode: "live", globalHalt: false });

    await updateGlobalHalt(ACTOR, false, "Feed confirmed healthy again", META);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ops.global_halt_disabled" }),
    );
  });
});

describe("updateFeedMode", () => {
  it("changes the feed mode and logs previous/next", async () => {
    mockGetOrCreateMarketControls.mockResolvedValue({ id: "singleton", feedMode: "live", globalHalt: false });
    mockSetFeedMode.mockResolvedValue({ id: "singleton", feedMode: "paused", globalHalt: false });

    const result = await updateFeedMode(ACTOR, "paused", META, "Vendor outage");

    expect(result.feedMode).toBe("paused");
    expect(mockSetFeedMode).toHaveBeenCalledWith("paused");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ops.feed_mode_changed",
        metadata: { previous: "live", next: "paused", reason: "Vendor outage" },
      }),
    );
  });

  it("logs a null reason when none is given", async () => {
    mockGetOrCreateMarketControls.mockResolvedValue({ id: "singleton", feedMode: "live", globalHalt: false });
    mockSetFeedMode.mockResolvedValue({ id: "singleton", feedMode: "delayed_15m", globalHalt: false });

    await updateFeedMode(ACTOR, "delayed_15m", META);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: null }) }),
    );
  });
});

describe("updateInstrumentHalted", () => {
  it("throws NOT_FOUND for an unknown instrument", async () => {
    mockGetInstrumentById.mockResolvedValue(null);

    await expect(updateInstrumentHalted(ACTOR, "inst_1", true, "Halting on rumor", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockSetInstrumentHalted).not.toHaveBeenCalled();
  });

  it("halts a symbol and logs ops.symbol_halted with the symbol and reason", async () => {
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "RELIANCE" });
    mockSetInstrumentHalted.mockResolvedValue({ id: "inst_1", symbol: "RELIANCE", halted: true });

    const result = await updateInstrumentHalted(ACTOR, "inst_1", true, "Unusual order flow", META);

    expect(result.halted).toBe(true);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ops.symbol_halted",
        targetType: "instrument",
        targetId: "inst_1",
        metadata: { symbol: "RELIANCE", reason: "Unusual order flow" },
      }),
    );
  });

  it("unhalts a symbol and logs ops.symbol_unhalted", async () => {
    mockGetInstrumentById.mockResolvedValue({ id: "inst_1", symbol: "RELIANCE" });
    mockSetInstrumentHalted.mockResolvedValue({ id: "inst_1", symbol: "RELIANCE", halted: false });

    await updateInstrumentHalted(ACTOR, "inst_1", false, "Confirmed non-issue", META);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ops.symbol_unhalted" }),
    );
  });
});
