// "gif" added 2026-11-27 (founder decision) specifically for worlds'
// animated card-media upload - deliberately NOT auto-enabled for every
// existing sniffImageType() caller (badges/service.ts, mentors/service.ts,
// staff/service.ts, worlds/service.ts's existing static-art upload), none
// of which this task touches or means to change. Gated behind the new
// `allowGif` option below, default false, so every one of those untouched
// call sites keeps rejecting a GIF exactly as before with zero code change
// on their part - only a caller that explicitly opts in can ever get "gif"
// back from sniffImageType.
export type ImageType = "png" | "jpeg" | "webp" | "gif";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

const IMAGE_CONTENT_TYPE: Record<ImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_EXTENSION: Record<ImageType, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

// Sniffs the actual file format from its magic bytes - never trusts a
// client-supplied Content-Type header or filename/extension, both of which
// are trivially spoofed (e.g. an SVG - which can carry a <script> payload -
// renamed to "art.png" with Content-Type: image/png would sail through a
// check based on either). Returns null for anything that doesn't match one
// of the allowed formats, including SVG, PDF, HTML or arbitrary bytes -
// there is no "unknown, allow anyway" case. `allowGif` defaults to false -
// see the ImageType comment above for why this isn't just always-on.
export function sniffImageType(bytes: Buffer, options?: { allowGif?: boolean }): ImageType | null {
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

  // GIF87a or GIF89a - the only two real GIF header versions. Only
  // detected when explicitly opted in (see the ImageType/function comments
  // above) - every other caller gets null for GIF bytes, same as today.
  if (
    options?.allowGif &&
    bytes.length >= 6 &&
    bytes.subarray(0, 3).toString("ascii") === "GIF" &&
    (bytes.subarray(3, 6).toString("ascii") === "87a" || bytes.subarray(3, 6).toString("ascii") === "89a")
  ) {
    return "gif";
  }

  return null;
}

export function imageContentType(type: ImageType): string {
  return IMAGE_CONTENT_TYPE[type];
}

export function imageExtension(type: ImageType): string {
  return IMAGE_EXTENSION[type];
}
