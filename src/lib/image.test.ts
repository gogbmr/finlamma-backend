import { describe, expect, it } from "vitest";
import { imageContentType, imageExtension, sniffImageType } from "./image";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0, 0, 0]), // chunk size, arbitrary
  Buffer.from("WEBP", "ascii"),
]);

describe("sniffImageType", () => {
  it("recognizes a real PNG by its magic bytes", () => {
    expect(sniffImageType(PNG_BYTES)).toBe("png");
  });

  it("recognizes a real JPEG by its magic bytes", () => {
    expect(sniffImageType(JPEG_BYTES)).toBe("jpeg");
  });

  it("recognizes a real WebP by its RIFF/WEBP markers", () => {
    expect(sniffImageType(WEBP_BYTES)).toBe("webp");
  });

  it("rejects an SVG even when it would be labeled image/png by a client - text content never matches any signature", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
    expect(sniffImageType(svg)).toBeNull();
  });

  it("rejects a GIF - only PNG/JPEG/WebP are allowed", () => {
    const gif = Buffer.from("GIF89a", "ascii");
    expect(sniffImageType(gif)).toBeNull();
  });

  it("rejects a PDF", () => {
    const pdf = Buffer.from("%PDF-1.4", "ascii");
    expect(sniffImageType(pdf)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it("rejects a truncated/malformed PNG header", () => {
    expect(sniffImageType(PNG_BYTES.subarray(0, 4))).toBeNull();
  });

  it("rejects arbitrary random bytes", () => {
    expect(sniffImageType(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]))).toBeNull();
  });

  it("ignores content entirely after the signature - detection is signature-only, not filename or declared type", () => {
    // A PNG signature followed by garbage is still a PNG as far as the
    // upload boundary cares (the actual image codec will reject genuinely
    // corrupt pixel data later); the point under test is that detection
    // never consults a filename or Content-Type, only these bytes.
    const pngWithGarbage = Buffer.concat([PNG_BYTES, Buffer.from("not real image data")]);
    expect(sniffImageType(pngWithGarbage)).toBe("png");
  });
});

describe("imageContentType / imageExtension", () => {
  it("maps each detected type to its canonical MIME type and extension", () => {
    expect(imageContentType("png")).toBe("image/png");
    expect(imageExtension("png")).toBe("png");
    expect(imageContentType("jpeg")).toBe("image/jpeg");
    expect(imageExtension("jpeg")).toBe("jpg");
    expect(imageContentType("webp")).toBe("image/webp");
    expect(imageExtension("webp")).toBe("webp");
  });
});
