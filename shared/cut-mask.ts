type MaskedLayer = {
  kind: string;
  effects: Array<{ kind: string; enabled?: boolean; parameters: Record<string, unknown> }>;
  enter?: { kind: string; maskAssetId?: string } | null;
  exit?: { kind: string; maskAssetId?: string } | null;
};

/** Native masks stay applied through the layer; custom transitions fade it. */
export function cutLayerMaskAsset(layer: MaskedLayer): string | null {
  const ids = Array.from(new Set([
    ...layer.effects.filter((effect) => effect.enabled !== false && effect.kind === "mask").map((effect) => effect.parameters.maskAssetId),
    layer.enter?.kind === "custom_mask" ? layer.enter.maskAssetId : undefined,
    layer.exit?.kind === "custom_mask" ? layer.exit.maskAssetId : undefined,
  ].filter((id): id is string => typeof id === "string" && Boolean(id))));
  if (!ids.length) return null;
  if (ids.length > 1) throw new Error("A layer must use one private mask across its effects and transitions.");
  if (!["text", "caption", "shape", "path", "svg", "image", "three"].includes(layer.kind)) throw new Error("Private masks are supported on static graphic layers; video, audio and animation masks are not supported yet.");
  return ids[0];
}

/** sRGB luminance multiplied by source alpha, not alpha-discarding grayscale. */
export function cutMaskAlpha(rgba: Uint8Array): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error("A mask requires four-channel RGBA pixels.");
  const alpha = new Uint8Array(rgba.length / 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    alpha[offset / 4] = Math.round((.2125 * rgba[offset] + .7154 * rgba[offset + 1] + .0721 * rgba[offset + 2]) * rgba[offset + 3] / 255);
  }
  return alpha;
}
