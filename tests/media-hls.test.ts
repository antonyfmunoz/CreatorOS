import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { finalizeOwnedHlsMediaPlaylist, finalizeOwnedHlsSegment, normalizeOwnedHlsTargetDuration } from "../server/media-hls";
import { runManagedMediaProcess } from "../server/media-process";

const decode = (source: string) => execFileSync("ffmpeg", ["-v", "error", "-protocol_whitelist", "file,pipe", "-i", source, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
const packets = (source: string, knownFixtureFormat = false) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", ...(knownFixtureFormat ? ["-f", "mpegts"] : []), "-show_packets", "-show_entries", "packet=pts_time,dts_time,duration_time,size", "-of", "json", source], { windowsHide: true, timeout: 10_000, encoding: "utf8", stdio: "pipe" })).packets;

it.each([1, 2, 3, 4, 12, 60])("plays every frame of a %i-frame HLS clip without extending or altering media", async (frames) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "media-short-hls-test-"));
  try {
    const source = path.join(directory, "source.mp4"), playlist = path.join(directory, "output.m3u8"), segment = path.join(directory, "segment-000.ts");
    await runManagedMediaProcess("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-frames:v", String(frames), "-c:v", "libx264", "-threads", "1", source], 10_000);
    await runManagedMediaProcess("ffmpeg", ["-v", "error", "-i", source, "-c", "copy", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", path.join(directory, "segment-%03d.ts"), playlist], 10_000);
    const original = await readFile(segment), originalManifest = await readFile(playlist);
    // Only the known synthetic baseline gets an explicit format to inspect
    // its timing despite the detection bug. Final output must auto-detect.
    const originalPackets = packets(segment, true);
    const added = await finalizeOwnedHlsSegment(segment);
    const finalized = await readFile(segment);
    expect(finalized.subarray(0, original.length).equals(original)).toBe(true);
    expect(added).toBe(Math.max(0, 3760 - original.length));
    expect(finalized.length).toBe(original.length + added);
    for (let offset = original.length; offset < finalized.length; offset += 188) {
      expect([...finalized.subarray(offset, offset + 4)]).toEqual([0x47, 0x1f, 0xff, 0x10]);
      expect(finalized.subarray(offset + 4, offset + 188).every((byte) => byte === 255)).toBe(true);
    }
    expect(await finalizeOwnedHlsSegment(segment)).toBe(0);
    await finalizeOwnedHlsMediaPlaylist(playlist);
    const finalManifest = await readFile(playlist, "utf8");
    expect(finalManifest).toBe(normalizeOwnedHlsTargetDuration(originalManifest.toString("utf8")));
    expect(finalManifest).toContain(`#EXT-X-TARGETDURATION:${Math.ceil(frames / 10)}`);
    expect(finalManifest.match(/^#EXTINF:.*$/gm)).toEqual(originalManifest.toString("utf8").match(/^#EXTINF:.*$/gm));
    expect(packets(segment)).toEqual(originalPackets);
    const expected = decode(source), actual = decode(playlist);
    expect(actual).toHaveLength(frames * 32 * 32 * 3);
    expect(actual.equals(expected)).toBe(true);
    // Packaging output remains distinct from an admissible ingest input.
    await expect(runManagedMediaProcess("ffprobe", ["-v", "error", "-show_streams", "-of", "json", playlist], 10_000)).rejects.toMatchObject({ code: "media_process_failed" });
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);

it.each([Buffer.alloc(0), Buffer.alloc(187), Buffer.alloc(188), Buffer.from([0x47, 0x1f, 0xff, 0, ...Array(184).fill(255)])])("does not turn malformed output into an apparently valid segment", async (bytes) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "media-invalid-hls-test-"));
  try {
    const file = path.join(directory, "invalid.ts"); await writeFile(file, bytes);
    await expect(finalizeOwnedHlsSegment(file)).rejects.toThrow(/Invalid generated transport/);
    expect((await readFile(file)).equals(bytes)).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("bounds positive target duration without changing media timing or valid larger targets", () => {
  const playlist = (target: string, duration: string) => `#EXTM3U\n#EXT-X-TARGETDURATION:${target}\n#EXTINF:${duration},\n0.ts\n#EXT-X-ENDLIST\n`;
  expect(normalizeOwnedHlsTargetDuration(playlist("0", "0.016667"))).toBe(playlist("1", "0.016667"));
  expect(normalizeOwnedHlsTargetDuration(playlist("4", "4.2"))).toBe(playlist("5", "4.2"));
  expect(normalizeOwnedHlsTargetDuration(playlist("6", "4.2"))).toBe(playlist("6", "4.2"));
  for (const invalid of [playlist("0", "0"), playlist("1", "NaN"), playlist("9007199254740999", "0.1"), playlist("1", "86401"), playlist("1", "0.1").replace("#EXT-X-ENDLIST", "#EXT-X-TARGETDURATION:2"), "x".repeat(512_001)]) {
    expect(() => normalizeOwnedHlsTargetDuration(invalid)).toThrow(/Invalid generated HLS/);
  }
});
