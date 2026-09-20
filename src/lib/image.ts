export type ImageType = "png" | "jpeg" | "webp";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

const IMAGE_CONTENT_TYPE: Record<ImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const IMAGE_EXTENSION: Record<ImageType, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

// Sniffs the actual file format from its magic bytes - never trusts a
// client-supplied Content-Type header or filename/extension, both of which
// are trivially spoofed (e.g. an SVG - which can carry a <script> payload -
// renamed to "art.png" with Content-Type: image/png would sail through a
// check based on either). Returns null for anything that doesn't match one
// of the three allowed formats, including SVG, GIF, PDF, HTML or arbitrary
// bytes - there is no "unknown, allow anyway" case.
export function sniffImageType(bytes: Buffer): ImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

export function imageContentType(type: ImageType): string {
  return IMAGE_CONTENT_TYPE[type];
}

export function imageExtension(type: ImageType): string {
  return IMAGE_EXTENSION[type];
}
