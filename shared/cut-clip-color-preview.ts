import type { CutClip } from "./cut-studio";

/**
 * A fast browser approximation for edit-time review. It intentionally does
 * not claim calibrated LUT or chroma-key output; those treatments remain on
 * the native render path where their pixels can be evaluated exactly.
 */
export function cutClipCssColorPreview(clip: CutClip | undefined) {
  const filters: string[] = [];
  if (clip?.colorPreset === "cinematic") filters.push("contrast(1.08)", "saturate(.9)", "brightness(.98)", "sepia(.08)");
  else if (clip?.colorPreset === "vivid") filters.push("contrast(1.08)", "saturate(1.25)");
  else if (clip?.colorPreset === "monochrome") filters.push("grayscale(1)");
  if (clip?.colorAdjust) {
    filters.push(`brightness(${1 + clip.colorAdjust.brightness})`, `contrast(${clip.colorAdjust.contrast})`, `saturate(${clip.colorAdjust.saturation})`);
    if (clip.colorAdjust.temperature > 0) filters.push(`sepia(${clip.colorAdjust.temperature * .12})`);
    else if (clip.colorAdjust.temperature < 0) filters.push(`hue-rotate(${clip.colorAdjust.temperature * 4}deg)`);
  }
  return filters.join(" ") || "none";
}

export function cutClipRequiresRenderedColorPreview(clip: CutClip | undefined) {
  return Boolean(clip?.lutAssetId || clip?.chromaKey?.enabled);
}
