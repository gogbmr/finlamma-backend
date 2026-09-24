import { describe, expect, it, vi } from "vitest";

// The route itself has no signature-verification logic of its own to test -
// that's entirely inngest/next's serve() reading the shared client's mode
// (src/lib/inngest.ts's isDev, covered by src/lib/inngest.test.ts). What
// this route IS responsible for getting right is wiring serve() to the
// right client and the right function list, so that's what's asserted here.
const mockServe: (options: unknown) => { GET: string; POST: string; PUT: string } = vi.fn(() => ({
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
}));
vi.mock("inngest/next", () => ({
  serve: mockServe,
}));

const FAKE_CLIENT = { id: "finlamma-backend" };
vi.mock("@/lib/inngest", () => ({ inngest: FAKE_CLIENT }));

const FAKE_FUNCTIONS = [{ id: "fn-1" }, { id: "fn-2" }];
vi.mock("@/inngest/functions", () => ({ functions: FAKE_FUNCTIONS }));

describe("GET/POST/PUT /api/inngest", () => {
  it("serves the shared client (whose isDev decides Cloud vs Dev mode) and every registered function", async () => {
    await import("./route");

    expect(mockServe).toHaveBeenCalledWith({ client: FAKE_CLIENT, functions: FAKE_FUNCTIONS });
  });
});
