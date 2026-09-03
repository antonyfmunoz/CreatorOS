import { open, readFile, writeFile } from "node:fs/promises";

const packetBytes = 188;
const minimumSegmentBytes = 20 * packetBytes;

/** Only for completed MPEG-TS output inside an owned packaging directory.
 * Very small valid segments can lose format auto-detection to MPEG-PS. Add
 * standard PID 0x1fff null packets, never pictures, samples or timestamps.
 * Larger segments are untouched; extra storage is strictly below 3,760 bytes.
 * This is not an uploaded-media validator or an input-policy exception. */
export async function finalizeOwnedHlsSegment(file: string) {
  const handle = await open(file, "r+");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size % packetBytes !== 0) throw new Error("Invalid generated transport segment");
    if (stat.size >= minimumSegmentBytes) return 0;
    const original = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(original, 0, original.length, 0);
    if (bytesRead !== stat.size) throw new Error("Generated transport segment changed before finalization");
    for (let offset = 0; offset < original.length; offset += packetBytes) {
      if (original[offset] !== 0x47 || (original[offset + 3] & 0x30) === 0) throw new Error("Invalid generated transport packet");
    }
    const padding = Buffer.alloc(minimumSegmentBytes - stat.size, 0xff);
    for (let offset = 0; offset < padding.length; offset += packetBytes) padding.set([0x47, 0x1f, 0xff, 0x10], offset);
    let written = 0;
    while (written < padding.length) {
      const result = await handle.write(padding, written, padding.length - written, stat.size + written);
      if (!result.bytesWritten) throw new Error("Unable to finish generated transport segment");
      written += result.bytesWritten;
    }
    return written;
  } finally {
    await handle.close();
  }
}

/** FFmpeg can round a sub-second VOD target to zero. Keep its exact EXTINF
 * media timing but publish a positive target that bounds every segment. */
export function normalizeOwnedHlsTargetDuration(manifest: string) {
  if (manifest.length > 512_000 || !manifest.startsWith("#EXTM3U\n") || !manifest.includes("#EXT-X-ENDLIST")) throw new Error("Invalid generated HLS media playlist");
  const targets = [...manifest.matchAll(/^#EXT-X-TARGETDURATION:(\d+)$/gm)];
  const durations = [...manifest.matchAll(/^#EXTINF:([0-9]+(?:\.[0-9]+)?),[^\n]*$/gm)].map((match) => Number(match[1]));
  if (targets.length !== 1 || !durations.length || durations.some((duration) => !Number.isFinite(duration) || duration <= 0 || duration > 86_400)) throw new Error("Invalid generated HLS segment timing");
  const target = Math.max(1, Number(targets[0][1]), Math.ceil(Math.max(...durations)));
  if (!Number.isSafeInteger(target) || target > 86_400) throw new Error("Invalid generated HLS target duration");
  return manifest.replace(/^#EXT-X-TARGETDURATION:\d+$/m, `#EXT-X-TARGETDURATION:${target}`);
}

export async function finalizeOwnedHlsMediaPlaylist(file: string) {
  const original = await readFile(file, "utf8");
  const normalized = normalizeOwnedHlsTargetDuration(original);
  if (normalized !== original) await writeFile(file, normalized, "utf8");
}
