import fs from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright-core";
import { cutTextLayoutSchema, cutTextStyles, CUT_NATIVE_TEXT_MAX_CHARACTERS, type CutTextLayout } from "../shared/cut-text-layout";
import { launchCutNativeRenderer } from "./cut-animation-renderer";
import { fitCutTextBox } from "../shared/cut-text-fit";

export const cutDefaultFontPath = () => path.resolve("shared/assets/cut-fonts/NotoSans-Variable.ttf");

// Native, data-only text, not a code-capsule executor. One browser per job,
// isolated contexts per title, no external requests or user HTML/JavaScript.
export function createCutTextRasterizer() {
  let browserPromise: Promise<Browser> | undefined;
  let closed = false;
  const close = async () => {
    closed = true;
    if (browserPromise) await browserPromise.then((browser) => browser.close()).catch(() => undefined);
  };
  const render = async (input: { text: string; layout: CutTextLayout; width: number; height: number; canvasWidth: number; referenceWidth: number; textColor: string; backgroundColor: string; backgroundOpacity: number; fontPath?: string; outputPath: string }) => {
    if (closed) throw new Error("Text renderer is closed");
    const layout = cutTextLayoutSchema.parse(input.layout);
    if (input.text.length > CUT_NATIVE_TEXT_MAX_CHARACTERS || ![input.width, input.height, input.canvasWidth, input.referenceWidth].every((value) => Number.isInteger(value) && value >= 2 && value <= 7680) || input.width * input.height > 3840 * 2160) throw new Error("Text raster exceeds its size budget");
    if (![input.textColor, input.backgroundColor].every((value) => /^#[0-9a-fA-F]{6}$/.test(value)) || !Number.isFinite(input.backgroundOpacity) || input.backgroundOpacity < 0 || input.backgroundOpacity > 1) throw new Error("Invalid text colors");
    const fontPath = input.fontPath ?? cutDefaultFontPath();
    const fontStat = await fs.stat(fontPath);
    if (!fontStat.isFile() || fontStat.size > 20 * 1024 * 1024) throw new Error("Text font exceeds its size budget");
    const fontBytes = await fs.readFile(fontPath);
    if (closed) throw new Error("Text renderer is closed");
    const colors = input.backgroundColor.match(/[a-f0-9]{2}/gi)!.map((value) => Number.parseInt(value, 16));
    const styles = cutTextStyles(layout, input.referenceWidth, input.canvasWidth, "CutNativeText", input.textColor, `rgba(${colors.join(",")},${input.backgroundOpacity})`);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
    try {
      deadline = setTimeout(() => { void close(); }, 30_000);
      browserPromise ??= launchCutNativeRenderer();
      const browser = await browserPromise;
      context = await browser.newContext({ viewport: { width: input.width, height: input.height }, deviceScaleFactor: 1, serviceWorkers: "block", offline: true });
      await context.route("**/*", (route) => route.abort("blockedbyclient"));
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      await page.setContent('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}</style><div id="box"><div id="content"></div></div>');
      await page.evaluate(async ({ text, style, encodedFont, weight, fontStyle }) => {
        const bytes = Uint8Array.from(atob(encodedFont), (character) => character.charCodeAt(0));
        const face = new FontFace("CutNativeText", bytes, { weight, style: fontStyle });
        document.fonts.add(await face.load());
        const box = document.getElementById("box")!;
        const content = document.getElementById("content")!;
        Object.assign(box.style, style.box);
        Object.assign(content.style, style.content);
        content.textContent = text;
        await document.fonts.ready;
      }, { text: input.text, style: styles, encodedFont: fontBytes.toString("base64"), weight: layout.fontFaceWeight === undefined ? "100 900" : String(layout.fontFaceWeight), fontStyle: layout.fontFaceStyle });
      const fitted = layout.autoFit ? await page.evaluate(fitCutTextBox, { boxId: "box", contentId: "content", maximum: `${layout.fontSize * input.canvasWidth / input.referenceWidth}px`, minimum: `${Math.min(layout.minimumFontSize, layout.fontSize) * input.canvasWidth / input.referenceWidth}px`, maxLines: layout.maxLines }) : null;
      if (fitted && !fitted.fits) throw new Error("Text cannot fit within its layer at the minimum font size; enlarge the layer, shorten the text or lower the minimum size.");
      await page.screenshot({ path: input.outputPath, type: "png", omitBackground: true, clip: { x: 0, y: 0, width: input.width, height: input.height }, timeout: 10_000 });
      return fitted;
    } finally {
      if (deadline) clearTimeout(deadline);
      await context?.close().catch(() => undefined);
    }
  };
  return { render, close };
}
