import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captures what src/lib/inngest.ts actually constructs the Inngest client
// with - this is the one thing that decides Cloud vs Dev mode for every
// route/job sharing this client (src/app/api/inngest/route.ts's serve()
// follows whatever mode the client it's given is in), so asserting the
// constructor call is a direct test of the real behavior, not an
// implementation detail.
const mockInngestConstructor = vi.fn();
vi.mock("inngest", () => ({
  Inngest: class {
    constructor(options: unknown) {
      mockInngestConstructor(options);
    }
  },
}));

const mockEnv = vi.hoisted(() => ({ VERCEL_ENV: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  mockEnv.VERCEL_ENV = undefined;
});

describe("inngest client mode", () => {
  it("runs in Dev mode (isDev: true) locally, with no VERCEL_ENV set - no signing key or manual INNGEST_DEV needed", async () => {
    mockEnv.VERCEL_ENV = undefined;

    await import("./inngest");

    expect(mockInngestConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finlamma-backend", isDev: true }),
    );
  });

  it("runs in Cloud mode (isDev: false) on a Vercel production deployment - requires INNGEST_SIGNING_KEY", async () => {
    mockEnv.VERCEL_ENV = "production";

    await import("./inngest");

    expect(mockInngestConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finlamma-backend", isDev: false }),
    );
  });

  it("runs in Cloud mode (isDev: false) on a Vercel preview deployment too", async () => {
    mockEnv.VERCEL_ENV = "preview";

    await import("./inngest");

    expect(mockInngestConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finlamma-backend", isDev: false }),
    );
  });
});
