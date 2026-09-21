import { describe, expect, it } from "vitest";
import { findMissingLocalizedText } from "./schemas";

describe("findMissingLocalizedText", () => {
  it("returns [] when every language is filled", () => {
    expect(findMissingLocalizedText({ en: "a", hi: "b", hx: "c" })).toEqual([]);
  });

  it("names each missing/blank language at the root", () => {
    expect(findMissingLocalizedText({ en: "a", hi: "", hx: "c" })).toEqual(["hi"]);
    expect(findMissingLocalizedText({ en: "", hi: "", hx: "c" })).toEqual(["en", "hi"]);
  });

  it("treats whitespace-only as missing", () => {
    expect(findMissingLocalizedText({ en: "a", hi: "   ", hx: "c" })).toEqual(["hi"]);
  });

  it("prefixes the path for a nested object field", () => {
    const result = findMissingLocalizedText({ title: { en: "a", hi: "", hx: "c" } });
    expect(result).toEqual(["title.hi"]);
  });

  it("indexes into arrays with bracket notation", () => {
    const result = findMissingLocalizedText({
      scenes: [
        { title: { en: "a", hi: "b", hx: "c" } },
        { title: { en: "", hi: "b", hx: "c" } },
      ],
    });
    expect(result).toEqual(["scenes[1].title.en"]);
  });

  it("walks arbitrarily deep, mixed object/array nesting (a realistic video lesson shape)", () => {
    const content = {
      lengthSeconds: 48,
      scenes: [
        {
          at: 5,
          title: { en: "Scene 1", hi: "सीन 1", hx: "Scene 1" },
          caption: { en: "", hi: "कैप्शन", hx: "Caption" },
          mascotLine: { en: "Hi", hi: "नमस्ते", hx: "" },
        },
      ],
      cues: [{ at: 10, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 8 }],
    };

    const result = findMissingLocalizedText(content);

    expect(result).toEqual(["scenes[0].caption.en", "scenes[0].mascotLine.hx"]);
  });

  it("ignores non-localized leaves entirely (numbers, plain strings, uuids)", () => {
    const result = findMissingLocalizedText({
      lengthSeconds: 48,
      questionIds: ["11111111-1111-4111-8111-111111111111"],
      note: "just a plain string, not {en,hi,hx}",
    });
    expect(result).toEqual([]);
  });

  it("returns [] for primitives, null and undefined", () => {
    expect(findMissingLocalizedText(null)).toEqual([]);
    expect(findMissingLocalizedText(undefined)).toEqual([]);
    expect(findMissingLocalizedText(42)).toEqual([]);
    expect(findMissingLocalizedText("plain string")).toEqual([]);
  });
});
