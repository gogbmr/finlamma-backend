import { describe, expect, it, vi } from "vitest";

const mockListActiveInstruments = vi.fn();
const mockGetOrCreateMarketControls = vi.fn();
const mockListMarketHolidays = vi.fn();
vi.mock("@/server/trading/repo", () => ({
  listActiveInstruments: () => mockListActiveInstruments(),
  getOrCreateMarketControls: () => mockGetOrCreateMarketControls(),
  listMarketHolidays: () => mockListMarketHolidays(),
}));

const { getRelayConfig } = await import("./service");

describe("getRelayConfig", () => {
  it("shapes instruments, feed mode, halt state and holidays for the relay", async () => {
    mockListActiveInstruments.mockResolvedValueOnce([
      { symbol: "RELIANCE", exchange: "NSE", halted: false, name: "Reliance", about: {}, tip: {} },
      { symbol: "SBIN", exchange: "NSE", halted: true, name: "SBI", about: {}, tip: {} },
    ]);
    mockGetOrCreateMarketControls.mockResolvedValueOnce({
      id: "singleton",
      feedMode: "delayed_15m",
      globalHalt: false,
    });
    mockListMarketHolidays.mockResolvedValueOnce([{ date: "2026-10-02", name: "Gandhi Jayanti" }]);

    const config = await getRelayConfig();

    expect(config).toEqual({
      instruments: [
        { symbol: "RELIANCE", exchange: "NSE", halted: false },
        { symbol: "SBIN", exchange: "NSE", halted: true },
      ],
      feedMode: "delayed_15m",
      globalHalt: false,
      holidays: ["2026-10-02"],
    });
  });

  it("never leaks internal instrument fields (about/tip/mcap/pe/id) to the relay", async () => {
    mockListActiveInstruments.mockResolvedValueOnce([
      {
        symbol: "RELIANCE",
        exchange: "NSE",
        halted: false,
        id: "inst_1",
        about: { en: "secret internal copy" },
        tip: { en: "another internal field" },
        mcap: 123,
        pe: 24.5,
      },
    ]);
    mockGetOrCreateMarketControls.mockResolvedValueOnce({ id: "singleton", feedMode: "live", globalHalt: false });
    mockListMarketHolidays.mockResolvedValueOnce([]);

    const config = await getRelayConfig();

    expect(config.instruments[0]).toEqual({ symbol: "RELIANCE", exchange: "NSE", halted: false });
  });
});
