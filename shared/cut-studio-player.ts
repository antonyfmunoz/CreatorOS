/** Shared transport limits keep reusable player inputs deterministic and bounded. */
export function cutPlayerRate(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(0.25, Math.min(4, value)) : 1;
}

export function cutPlayerFrame(value: number, durationInFrames: number) {
  return Math.min(Math.max(0, durationInFrames - 1), Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0));
}

export function cutPlayerGain(layerVolume: number, masterVolume: number) {
  return Math.max(0, Math.min(2, Number.isFinite(layerVolume) ? layerVolume : 1))
    * Math.max(0, Math.min(1, Number.isFinite(masterVolume) ? masterVolume : 1));
}

/** Preserve the composition ratio while bounding both output edges to a rendition. */
export function cutCompositionRenditionSize(width: number, height: number, resolution: "720p" | "1080p" | "2160p"): [number, number] {
  const shortEdge = resolution === "2160p" ? 2160 : resolution === "1080p" ? 1080 : 720;
  const longEdge = shortEdge * 16 / 9;
  const scale = Math.min(shortEdge / Math.min(width, height), longEdge / Math.max(width, height));
  return [Math.max(2, Math.round(width * scale / 2) * 2), Math.max(2, Math.round(height * scale / 2) * 2)];
}
