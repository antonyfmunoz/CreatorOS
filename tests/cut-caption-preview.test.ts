import { describe, expect, it } from "vitest";
import { cutCaptionPreviewAt } from "../shared/cut-caption-preview";

const transcript = { duration: 10, language: "en", segments: [
  { id: "s1", start: 1, end: 3, text: "Build it better", speaker: "Antony", words: [{ word: "Build", start: 1, end: 1.4 }, { word: "it", start: 1.4, end: 1.7 }, { word: "better", start: 1.7, end: 3 }] },
] };

describe("CutStudio edit-time captions", () => {
  it("resolves the active transcript segment and kinetic word at the current source time", () => {
    expect(cutCaptionPreviewAt(transcript, 1.5)).toEqual({ text: "Build it better", speaker: "Antony", activeWord: "it" });
  });

  it("does not paint a caption outside an authored transcript interval", () => {
    expect(cutCaptionPreviewAt(transcript, .99)).toBeNull();
    expect(cutCaptionPreviewAt(transcript, 3)).toBeNull();
  });
});
