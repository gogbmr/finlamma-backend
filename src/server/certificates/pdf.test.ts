import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "./pdf";

// App asks batch, item A18: a real (unmocked) render smoke test - the
// restyled template adds SVG primitives (Circle/Line/G) and a shorthand
// `border` style react-pdf's Yoga-based layout engine must actually
// accept; src/server/certificates/service.test.ts mocks this module
// entirely, so nothing else in the suite would catch a real rendering
// error from the template itself.
describe("renderCertificatePdf", () => {
  it("renders a non-empty PDF buffer for the restyled template", async () => {
    const buffer = await renderCertificatePdf({
      displayName: "Aarav S",
      worldTitle: "Markets 101",
      code: "FLM-TEST-0001",
      xpEarned: 1250,
      accuracyPct: 92,
      issuedAt: new Date("2026-10-05T00:00:00.000Z"),
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // PDF magic header.
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
