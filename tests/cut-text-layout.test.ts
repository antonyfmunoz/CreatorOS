import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cutTextLayoutSchema, cutTextStyles, resolveCutTextLayout } from "../shared/cut-text-layout";
import { compileCompositionToEdl } from "../shared/cut-studio-production";

describe("shared native composition text layout", () => {
  it("uses the same layout rules with canvas units or delivery pixels", () => {
    const layout = resolveCutTextLayout({ fontSize: 72, textAlign: "center", verticalAlign: "middle", lineHeight: 1.5, letterSpacing: 2, paddingX: 24 });
    const preview = cutTextStyles(layout, 1920, "container", "Noto Sans", "#ffffff", "transparent");
    const output = cutTextStyles(layout, 1920, 960, "Noto Sans", "#ffffff", "transparent");
    expect(preview.content.fontSize).toBe("3.75cqw");
    expect(output.content.fontSize).toBe("36px");
    expect(output.box.padding).toBe("4px 12px");
    expect(preview.content).toMatchObject({ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: "1.5", textAlign: "center" });
    expect(output.box.justifyContent).toBe("center");
  });
  it("bounds authoring values and rejects invalid persisted text contracts", () => {
    expect(resolveCutTextLayout({ fontSize: 999, lineHeight: 200, letterSpacing: -100, textAlign: "url(example)" })).toMatchObject({ fontSize: 400, lineHeight: 3, letterSpacing: -5, align: "left" });
    expect(() => cutTextLayoutSchema.parse({ fontWeight: 701 })).toThrow();
    expect(() => cutTextLayoutSchema.parse({ align: "justify" })).toThrow();
    expect(resolveCutTextLayout({ fontStyle: "italic" })).toMatchObject({ fontStyle: "italic", fontFaceStyle: "normal" });
    expect(resolveCutTextLayout({ fontStyle: "italic" }, { weight: 400, style: "normal" })).toMatchObject({ fontStyle: "italic", fontFaceStyle: "normal", fontFaceWeight: 400 });
    expect(resolveCutTextLayout({}, { weight: 400, style: "italic" })).toMatchObject({ fontStyle: "italic", fontFaceStyle: "italic" });
    expect(resolveCutTextLayout({ fontStyle: "normal" }, { weight: 400, style: "italic" })).toMatchObject({ fontStyle: "normal", fontFaceStyle: "italic" });
  });
  it("retains line breaks, full authoring size and an absent background at compile time", () => {
    const result = compileCompositionToEdl({ version: 1, name: "Text", width: 1920, height: 1080, fps: 30, durationInFrames: 30, layers: [
      { id: "video", kind: "video", name: "Source", from: 0, durationInFrames: 30, assetId: "00000000-0000-4000-8000-000000000001" },
      { id: "text", kind: "text", name: "Text", from: 0, durationInFrames: 30, text: "ALPHA\nBRAVO", style: { fontSize: 300, textAlign: "right", verticalAlign: "bottom" } },
    ] }, { version: 3, clips: [{ start: 0, end: 1 }] });
    expect(result.graphics?.[0]).toMatchObject({ text: "ALPHA\nBRAVO", backgroundOpacity: 0, fontReferenceWidth: 1920, textLayout: { version: 1, fontSize: 300, align: "right", verticalAlign: "bottom" } });
  });
  it("pins the default font bytes shared by the client and worker", () => {
    const bytes = readFileSync("shared/assets/cut-fonts/NotoSans-Variable.ttf");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d");
    expect(readFileSync("shared/assets/cut-fonts/OFL.txt", "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
  it("bounds opt-in fitting without changing legacy layout defaults", () => {
    expect(resolveCutTextLayout({})).toMatchObject({ autoFit: false, minimumFontSize: 8, maxLines: 0 });
    expect(resolveCutTextLayout({ autoFit: true, minimumFontSize: 200, fontSize: 48, maxLines: 300 })).toMatchObject({ autoFit: true, minimumFontSize: 48, maxLines: 20 });
    expect(() => cutTextLayoutSchema.parse({ autoFit: "true" })).toThrow();
    expect(() => cutTextLayoutSchema.parse({ maxLines: 1.5 })).toThrow();
  });
});
