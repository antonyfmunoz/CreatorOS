import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runManagedMediaProcess } from "../server/media-process";

describe("managed media subprocess boundary", () => {
  it("rejects input-policy overrides before starting either media tool", async () => {
    const started = vi.fn();
    for (const command of ["ffmpeg", "ffprobe"] as const) {
      for (const option of ["-format_whitelist", "-protocol_whitelist", "-enable_drefs", "-use_absolute_path"]) {
        await expect(runManagedMediaProcess(command, [option, "ALL", "-i", "source.mp4"], 1_000, { started })).rejects.toThrow(/cannot be overridden/);
      }
    }
    expect(started).not.toHaveBeenCalled();
  });

  it("retains real ingest metadata and generated HLS output while rejecting uploaded manifests", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "managed-media-hls-test-"));
    try {
      const source = path.join(directory, "source.mp4"), playlist = path.join(directory, "output.m3u8");
      await runManagedMediaProcess("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-t", "1.2", "-c:v", "libx264", "-threads", "1", source], 10_000);
      const probe = JSON.parse(await runManagedMediaProcess("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", source], 10_000));
      expect(probe.streams[0]).toMatchObject({ codec_name: "h264", width: 32, height: 32 });
      expect(Number(probe.format.duration)).toBeGreaterThan(1);
      await runManagedMediaProcess("ffmpeg", ["-v", "error", "-i", source, "-c", "copy", "-hls_time", "1", "-hls_playlist_type", "vod", "-hls_segment_filename", path.join(directory, "segment-%03d.ts"), playlist], 10_000);
      const manifest = await readFile(playlist, "utf8");
      expect(manifest).toContain("#EXT-X-ENDLIST");
      expect(manifest).toContain("segment-000.ts");
      // Independent playback of our generated output proves packaging survived
      // the input restriction; an uploaded manifest is never an ingest source.
      const pixels = execFileSync("ffmpeg", ["-v", "error", "-i", playlist, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { windowsHide: true, timeout: 5_000, stdio: "pipe" });
      expect(pixels).toHaveLength(32 * 32 * 3);
      expect(pixels[0]).toBeLessThan(10); expect(pixels[2]).toBeGreaterThan(245);
      await expect(runManagedMediaProcess("ffprobe", ["-v", "error", "-show_streams", "-of", "json", playlist], 10_000)).rejects.toMatchObject({ code: "media_process_failed" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("does not persist private filenames or decoder diagnostics as job errors", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "managed-media-error-test-"));
    try {
      const source = path.join(directory, "private-owner-secret-name.mp4");
      await writeFile(source, "NOT_MEDIA_PRIVATE_CONTENT");
      let finished = false;
      await expect(runManagedMediaProcess("ffprobe", ["-v", "error", "-show_format", "-of", "json", source], 5_000, { finished() { finished = true; } })).rejects.toMatchObject({ message: "Media processing failed", code: "media_process_failed" });
      expect(finished).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("waits for actual exit on timeout and cancellation before releasing a managed process", async () => {
    for (const cancelAtRegistration of [false, true]) {
      let pid: number | undefined, finished = false;
      await expect(runManagedMediaProcess("ffmpeg", ["-v", "error", "-re", "-f", "lavfi", "-i", "sine=frequency=440", "-f", "null", "-"], cancelAtRegistration ? 5_000 : 100, {
        started(child) { pid = child.pid; if (cancelAtRegistration) child.kill("SIGKILL"); },
        finished() { finished = true; },
      })).rejects.toMatchObject({ code: cancelAtRegistration ? "media_process_failed" : "media_timeout" });
      expect(finished).toBe(true); expect(pid).toBeGreaterThan(0);
      expect(() => process.kill(pid!, 0)).toThrow();
    }
  });

  it("bounds aggregate probe output and reaps the actual overflowing decoder", async () => {
    let pid: number | undefined, finished = false;
    await expect(runManagedMediaProcess("ffprobe", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=2x2:r=60", "-show_frames", "-of", "json"], 10_000, {
      started(child) { pid = child.pid; }, finished() { finished = true; },
    })).rejects.toMatchObject({ code: "media_process_failed" });
    expect(finished).toBe(true); expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid!, 0)).toThrow();
  });
});
