import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cutGraphicSchema } from "../shared/cut-studio";
import { cutTextRasterFilter, cutTextRasterMetrics, cutTextRasterSource } from "../server/cut-text-raster";

const graphic = cutGraphicSchema.parse({ id: "headline", text: "Turn attention into momentum", timelineStart: 0, duration: 3, fontSize: 72, fontReferenceWidth: 1920, backgroundOpacity: 0 });
function escapedPath(value: string) {
  const normalized = path.resolve(value).split(path.sep).join("/");
  if (!/^[A-Za-z0-9_./: ()~-]+$/.test(normalized)) throw new Error("Unsupported qualification path");
  return Array.from(normalized, (character) => character === ":" ? "\\:" : character).join("");
}

async function raster(canvasWidth: number, width: number, backgroundOpacity = 0, text = graphic.text) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "cut-text-pixels-"));
  try {
    const file = path.join(directory, "title.txt");
    writeFileSync(file, text);
    const font = process.platform === "win32" ? "C:/Windows/Fonts/arialbd.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const png = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", cutTextRasterSource(width, 160), "-vf", cutTextRasterFilter({ ...graphic, backgroundOpacity }, canvasWidth, `fontfile='${escapedPath(font)}':`, escapedPath(file)), "-frames:v", "1", "-threads", "1", "-c:v", "png", "-f", "image2pipe", "pipe:1"], { timeout: 10000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const result = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = { left: width, right: -1, top: 160, bottom: -1, count: 0 };
    for (let y = 0; y < 160; y++) for (let x = 0; x < width; x++) {
      if (result.data[(y * width + x) * 4 + 3] > 0) {
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y); bounds.count++;
      }
    }
    return { ...result, bounds };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("CutStudio responsive title raster", () => {
  it("keeps authored proportions and preserves legacy pixel sizing", () => {
    expect(cutTextRasterMetrics(graphic, 406)).toEqual({ fontSize: 15.225, padding: 3 });
    expect(cutTextRasterMetrics({ fontSize: 72 }, 406)).toEqual({ fontSize: 72, padding: 12 });
    expect(cutGraphicSchema.parse({ ...graphic, fontReferenceWidth: undefined }).fontReferenceWidth).toBeUndefined();
    for (const bad of [0, 239, 7681, NaN, Infinity]) expect(() => cutTextRasterMetrics({ ...graphic, fontReferenceWidth: bad }, 406)).toThrow();
    expect(() => cutTextRasterSource(0, 160)).toThrow();
    expect(() => cutTextRasterMetrics(graphic, Infinity)).toThrow();
  });

  it("renders the entire portrait headline without clipping its last glyphs", async () => {
    const portrait = await raster(406, 292);
    const unclipped = await raster(406, 900);
    expect(portrait.bounds).toEqual(unclipped.bounds);
    expect(portrait.bounds.count).toBeGreaterThan(300);
    expect(portrait.bounds.right).toBeLessThan(289);
    const landscape = await raster(1920, 1600);
    const portraitHeight = portrait.bounds.bottom - portrait.bounds.top + 1;
    const landscapeHeight = landscape.bounds.bottom - landscape.bounds.top + 1;
    expect(Math.abs(portraitHeight - landscapeHeight * 406 / 1920)).toBeLessThanOrEqual(2);
  }, 30000);

  it("preserves alpha outside the title box and the requested partial box opacity", async () => {
    const rendered = await raster(406, 292, .72);
    const alpha = [...rendered.data].filter((_, index) => index % 4 === 3);
    expect(alpha[0]).toBe(0);
    expect(alpha.at(-1)).toBe(0);
    expect(alpha.filter((value) => value === 0).length).toBeGreaterThan(292 * 100);
    expect(alpha.some((value) => value >= 180 && value <= 186)).toBe(true);
    expect(Math.max(...alpha)).toBeGreaterThan(240);
  });

  it("treats punctuation and filter-looking text as literal UTF-8 content", async () => {
    const rendered = await raster(406, 900, 0, "50%: it's [not]; drawbox=red, \\ %{pts}");
    expect(rendered.bounds.count).toBeGreaterThan(300);
    expect(rendered.data[3]).toBe(0);
  });
});
