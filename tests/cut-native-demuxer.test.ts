import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { probeCutMedia } from "../server/cut-native-probe";
import { runCutNativeProcess } from "../server/cut-native-process";
import { runManagedMediaProcess } from "../server/media-process";

const execute = (command: string, args: string[]) => execFileSync(command, args, {
  windowsHide: true, timeout: 10_000, stdio: "pipe", maxBuffer: 1024 * 1024,
});

async function privateManifestFixtures(directory: string) {
  const mediaDirectory = path.join(directory, "other-owner-fixture");
  const inputDirectory = path.join(directory, "uploaded-fixture");
  await mkdir(mediaDirectory); await mkdir(inputDirectory);
  const video = path.join(inputDirectory, "private-video.mp4");
  execute("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-t", "0.3", "-c:v", "libx264", "-threads", "1", video]);
  execute("ffmpeg", ["-v", "error", "-i", video, "-c", "copy", "-f", "mpegts", path.join(mediaDirectory, "segment.ts")]);
  // All referenced bytes belong to this disposable test. Current FFmpeg rejects
  // HLS with a non-HLS extension itself; keep the valid-extension control honest.
  // The concat fixture separately exercises content disguised as an MP4.
  const hls = path.join(inputDirectory, "playlist.m3u8");
  await writeFile(hls, "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:0.3,\n../other-owner-fixture/segment.ts\n#EXT-X-ENDLIST\n");
  const concat = path.join(inputDirectory, "disguised-concat.mp4");
  await writeFile(concat, "ffconcat version 1.0\nfile 'private-video.mp4'\n");
  return { video, manifests: [hls, concat] };
}

describe("native self-contained media boundary", () => {
  it.each([0, 1])("rejects local-file manifests during inspection with reachable control %i", async index => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-demuxer-probe-test-"));
    try {
      const { manifests } = await privateManifestFixtures(directory);
      for (const source of [manifests[index]]) {
        const control = JSON.parse(execute("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-of", "json", source]).toString());
        expect(control.streams.some((stream: { codec_type: string }) => stream.codec_type === "video")).toBe(true);
        await expect(probeCutMedia(source)).rejects.toThrow("The source media could not be inspected");
        await expect(runManagedMediaProcess("ffprobe", ["-v", "error", "-show_streams", "-of", "json", source], 10_000)).rejects.toMatchObject({ message: "Media processing failed", code: "media_process_failed" });
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each([0, 1])("rejects local-file manifests on later render inputs without a copied artifact %i", async index => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-demuxer-render-test-"));
    try {
      const { video, manifests } = await privateManifestFixtures(directory);
      const decode = (source: string) => execute("ffmpeg", ["-v", "error", "-protocol_whitelist", "file,pipe", "-i", source, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      const expected = decode(video);
      expect(expected.length).toBe(32 * 32 * 3);
      for (const source of [manifests[index]]) {
        // Independent decoder proves these are working file reads, not malformed
        // fixtures which would fail even without the application boundary.
        expect(decode(source).equals(expected)).toBe(true);
        const output = path.join(directory, `rejected-${index}.mp4`);
        let closed = false;
        await expect(runCutNativeProcess("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:r=10", "-i", source, "-map", "1:v:0", "-frames:v", "1", "-c:v", "libx264", "-threads", "1", output], {
          timeoutMs: 10_000, finished() { closed = true; },
        })).rejects.toThrow(/^Native processing failed \(exit \d+\)$/);
        expect(closed).toBe(true);
        await expect(access(output)).rejects.toThrow();
        await expect(runManagedMediaProcess("ffmpeg", ["-v", "error", "-i", source, "-frames:v", "1", "-c:v", "libx264", "-threads", "1", output], 10_000)).rejects.toMatchObject({ message: "Media processing failed", code: "media_process_failed" });
        await expect(access(output)).rejects.toThrow();
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["mp4", "libx264"], ["mov", "libx264"], ["webm", "libvpx"], ["avi", "mpeg4"],
  ])("keeps actual %s video inspection and decoding", async (extension, codec) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-demuxer-video-test-"));
    try {
      const source = path.join(directory, `source.${extension}`), output = path.join(directory, "decoded.png");
      execute("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-t", "0.3", "-c:v", codec, "-threads", "1", source]);
      expect(await probeCutMedia(source)).toMatchObject({ hasVideo: true, videoGeometry: { width: 32, height: 32 } });
      await runCutNativeProcess("ffmpeg", ["-v", "error", "-i", source, "-frames:v", "1", "-threads", "1", output], { timeoutMs: 10_000 });
      const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(32); expect(info.height).toBe(32);
      expect(data[0]).toBeLessThan(10); expect(data[2]).toBeGreaterThan(245);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["wav", "pcm_s16le"], ["mp3", "libmp3lame"], ["m4a", "aac"], ["aac", "aac"],
    ["ogg", "libvorbis"], ["flac", "flac"], ["webm", "libopus"],
  ])("keeps actual %s audio inspection and decoding", async (extension, codec) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-demuxer-audio-test-"));
    try {
      const source = path.join(directory, `source.${extension}`), output = path.join(directory, "decoded.wav");
      execute("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.3", "-c:a", codec, "-threads", "1", source]);
      expect(await probeCutMedia(source)).toMatchObject({ hasAudio: true, hasVideo: false });
      await runCutNativeProcess("ffmpeg", ["-v", "error", "-i", source, "-c:a", "pcm_s16le", output], { timeoutMs: 10_000 });
      const decoded = execute("ffmpeg", ["-v", "error", "-i", output, "-f", "s16le", "-ac", "1", "-ar", "48000", "pipe:1"]);
      expect(decoded.length).toBeGreaterThan(48_000 * .2 * 2);
      expect(decoded.some(byte => byte !== 0)).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(["png", "jpeg", "gif", "webp"] as const)("keeps actual %s image inspection and decoding", async format => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-demuxer-image-test-"));
    try {
      const source = path.join(directory, `source.${format}`), output = path.join(directory, "decoded.png");
      await sharp({ create: { width: 32, height: 32, channels: 4, background: "#ff0000" } }).toFormat(format).toFile(source);
      expect(await probeCutMedia(source)).toMatchObject({ hasVideo: true, videoGeometry: { width: 32, height: 32 } });
      await runCutNativeProcess("ffmpeg", ["-v", "error", "-i", source, "-frames:v", "1", "-threads", "1", output], { timeoutMs: 10_000 });
      const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(32); expect(info.height).toBe(32);
      expect(data[0]).toBeGreaterThan(245); expect(data[2]).toBeLessThan(10);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
