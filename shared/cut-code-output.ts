export type CutCodeOutputDescriptor = {
  format: string;
  mimeType: string;
  filename: string;
  assetKind: "image" | "video" | "audio" | "file";
};

// This stays deliberately separate from the renderer. The paired node receives
// untrusted persisted job data, so its object-store MIME type and project-media
// kind must be recomputed from a narrow allowlist before an upload URL exists.
export function describeCutCodeOutput(runtime: Record<string, unknown>): CutCodeOutputDescriptor {
  if (runtime.mode === "sequence") {
    return { format: "zip", mimeType: "application/zip", filename: "cutstudio-code-render.zip", assetKind: "file" };
  }
  const mode = runtime.mode;
  if (mode !== "still" && mode !== "video" && mode !== "audio") throw new Error("The queued job does not have a supported output mode");
  const format = typeof runtime.format === "string" ? runtime.format : mode === "video" ? "mp4" : mode === "audio" ? "wav" : "png";
  const mimeType = new Map([
    ["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"],
    ["mp4", "video/mp4"], ["webm", "video/webm"], ["gif", "image/gif"], ["mov", "video/quicktime"],
    ["wav", "audio/wav"], ["mp3", "audio/mpeg"], ["m4a", "audio/mp4"],
  ]).get(format);
  if (!mimeType) throw new Error("The queued job does not have a supported output format");
  // An animated GIF has video-style timing, but its private media record must
  // remain an image so browser preview and image-graphic handoff use its real
  // MIME type instead of trying to load image/gif in a video element.
  const assetKind = mode === "video" ? format === "gif" ? "image" : "video" : mode === "audio" ? "audio" : "image";
  return { format, mimeType, filename: `cutstudio-code-render.${format}`, assetKind };
}
