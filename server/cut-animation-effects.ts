import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type CutAnimationEffectGraphic = {
  effects: Array<{ kind: string; parameters: Record<string, unknown> }>;
};

function effect(graphic: CutAnimationEffectGraphic, kind: string) {
  return graphic.effects.find((item) => item.kind === kind);
}

function effectNumber(item: ReturnType<typeof effect>, key: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(item?.parameters[key]);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function effectColor(item: ReturnType<typeof effect>, key: string, fallback: string) {
  const value = item?.parameters[key];
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/** Bake the bounded CSS-equivalent glow/shadow surface used by native graphics. */
export async function bakeCutGraphicGlowAndShadow(graphic: CutAnimationEffectGraphic, inputPath: string, outputPath: string, width: number, height: number) {
  const shadow = effect(graphic, "drop_shadow");
  const glow = effect(graphic, "glow");
  if (!shadow && !glow) return inputPath;
  const shadowBlur = effectNumber(shadow, "blur", 10, 0, 40);
  const shadowX = effectNumber(shadow, "x", 4, -40, 40);
  const shadowY = effectNumber(shadow, "y", 6, -40, 40);
  const shadowColor = effectColor(shadow, "color", "#000000");
  const glowBlur = effectNumber(glow, "radius", 16, 0, 60);
  const glowColor = effectColor(glow, "color", "#1d9bf0");
  const source = (await fs.readFile(inputPath)).toString("base64");
  const nodes = [
    shadow ? `<feOffset in="SourceAlpha" dx="${shadowX}" dy="${shadowY}" result="shadowOffset"/><feGaussianBlur in="shadowOffset" stdDeviation="${shadowBlur}" result="shadowBlur"/><feFlood flood-color="${shadowColor}" flood-opacity="0.8" result="shadowColor"/><feComposite in="shadowColor" in2="shadowBlur" operator="in" result="shadow"/>` : "",
    glow ? `<feGaussianBlur in="SourceAlpha" stdDeviation="${glowBlur}" result="glowBlur"/><feFlood flood-color="${glowColor}" flood-opacity="0.9" result="glowColor"/><feComposite in="glowColor" in2="glowBlur" operator="in" result="glow"/>` : "",
  ].join("");
  const merge = `${shadow ? '<feMergeNode in="shadow"/>' : ""}${glow ? '<feMergeNode in="glow"/>' : ""}<feMergeNode in="SourceGraphic"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="fx" x="0" y="0" width="100%" height="100%">${nodes}<feMerge>${merge}</feMerge></filter></defs><image width="${width}" height="${height}" href="data:image/png;base64,${source}" filter="url(#fx)"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return outputPath;
}

/** Decorate every isolated animation frame without mutating the source sequence. */
export async function bakeCutAnimationGlowAndShadowFrames(input: {
  graphic: CutAnimationEffectGraphic;
  pattern: string;
  frameCount: number;
  width: number;
  height: number;
  outputDirectory: string;
  onProgress?: (completedFrames: number, totalFrames: number) => Promise<void>;
}) {
  if (!effect(input.graphic, "drop_shadow") && !effect(input.graphic, "glow")) return input.pattern;
  await fs.mkdir(input.outputDirectory, { recursive: true });
  const patternName = path.basename(input.pattern);
  for (let frame = 0; frame < input.frameCount; frame += 1) {
    const filename = patternName.replace("%06d", String(frame).padStart(6, "0"));
    await bakeCutGraphicGlowAndShadow(input.graphic, path.join(path.dirname(input.pattern), filename), path.join(input.outputDirectory, filename), input.width, input.height);
    if ((frame + 1) % 10 === 0 || frame + 1 === input.frameCount) await input.onProgress?.(frame + 1, input.frameCount);
  }
  return path.join(input.outputDirectory, patternName);
}
