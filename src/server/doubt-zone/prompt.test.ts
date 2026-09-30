import { describe, expect, it } from "vitest";
import { buildDoubtZoneSystemPrompt } from "./prompt";

describe("buildDoubtZoneSystemPrompt", () => {
  it("includes the mentor persona and language instruction", () => {
    const prompt = buildDoubtZoneSystemPrompt({ mentorPersona: "Wise and calm.", language: "hi" });

    expect(prompt).toContain("Wise and calm.");
    expect(prompt).toContain("Reply in Hindi");
  });

  it("falls back to a generic persona when none is given", () => {
    const prompt = buildDoubtZoneSystemPrompt({ mentorPersona: "", language: "en" });

    expect(prompt).toContain("A warm, encouraging mentor.");
  });

  it("includes the lesson topic only when provided", () => {
    const withTopic = buildDoubtZoneSystemPrompt({
      mentorPersona: "x",
      language: "en",
      lessonTopic: "Compound interest",
    });
    const withoutTopic = buildDoubtZoneSystemPrompt({ mentorPersona: "x", language: "en" });

    expect(withTopic).toContain("Compound interest");
    expect(withoutTopic).not.toContain("The learner opened this chat from a lesson");
  });

  it("states the never-investment-advice rule", () => {
    const prompt = buildDoubtZoneSystemPrompt({ mentorPersona: "x", language: "en" });

    expect(prompt).toContain("never investment advice");
    expect(prompt).toContain("Never predict what a price will do");
  });

  it("never hands the model a specific phone number to relay - the deterministic redirect owns that", () => {
    const prompt = buildDoubtZoneSystemPrompt({ mentorPersona: "x", language: "en" });

    expect(prompt).not.toMatch(/\d{4,}/);
    expect(prompt).toContain("do not guess at or state any phone number yourself");
  });

  it("instructs the model never to ask for identifying details", () => {
    const prompt = buildDoubtZoneSystemPrompt({ mentorPersona: "x", language: "en" });

    expect(prompt.toLowerCase()).toContain("never ask for or store the learner's name");
  });
});
