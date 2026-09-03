import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { cutNativeInputArgs, runCutNativeProcess } from "../server/cut-native-process";
import { cutJobErrorDetail } from "../server/cut-render-paths";
import { cutNativeMediaEnvironment } from "../server/cut-native-environment";
import { readCutProbeOutput } from "../server/cut-native-probe";
import { cutNativeInputPolicyArgs, CUT_NATIVE_INPUT_FORMATS } from "../server/cut-native-input-policy";

describe("native render input and error boundaries", () => {
  it("keeps only host/runtime settings and strips application authority from actual child processes", async () => {
    const input = { PATH: "runtime-bin", SystemRoot: "system", TEMP: "temp", FONTCONFIG_FILE: "font.conf", CLERK_SECRET_KEY: "fixture", DATABASE_URL: "fixture", AWS_SECRET_ACCESS_KEY: "fixture", FFREPORT: "fixture" };
    expect(cutNativeMediaEnvironment(input)).toEqual({ PATH: "runtime-bin", SystemRoot: "system", TEMP: "temp", FONTCONFIG_FILE: "font.conf" });
    const names = ["CUT_TEST_PRIVATE_CREDENTIAL", "DATABASE_URL", "FFREPORT"];
    try {
      for (const name of names) vi.stubEnv(name, "synthetic-test-only");
      const expression = `JSON.stringify(${JSON.stringify(names)}.map(name => Object.hasOwn(process.env, name)))`;
      expect(await runCutNativeProcess(process.execPath, ["-e", `process.stderr.write(${expression})`], { timeoutMs: 5_000 })).toBe("[false,false,false]");
      expect(await readCutProbeOutput(process.execPath, ["-e", `process.stdout.write(${expression})`], { timeoutMs: 5_000, maxBytes: 100 })).toBe("[false,false,false]");
    } finally { vi.unstubAllEnvs(); }
  });
  it("applies a non-overridable policy to every input without mutating the caller", () => {
    const input = ["-y", "-threads", "1", "-i", "first.mp4", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-i", "frame-%06d.png", "output.mp4"];
    const original = [...input];
    expect(cutNativeInputArgs(input)).toEqual(["-y", "-threads", "1", ...cutNativeInputPolicyArgs(), "-i", "first.mp4", "-f", "lavfi", ...cutNativeInputPolicyArgs(), "-i", "color=c=blue:s=32x32", ...cutNativeInputPolicyArgs(), "-i", "frame-%06d.png", "output.mp4"]);
    expect(cutNativeInputPolicyArgs()).toEqual(["-protocol_whitelist", "file,pipe", "-format_whitelist", CUT_NATIVE_INPUT_FORMATS]);
    for (const format of ["hls", "dash", "concat", "sdp", "imf"]) expect(CUT_NATIVE_INPUT_FORMATS.split(",")).not.toContain(format);
    expect(input).toEqual(original);
    for (const override of ["-protocol_whitelist", "-protocol_whitelist=ALL", "-protocol_whitelist:0", "-protocol_blacklist", "-format_whitelist", "-format_whitelist=ALL", "-enable_drefs", "-use_absolute_path:0"]) {
      expect(() => cutNativeInputArgs([override, "ALL", "-i", "source.mp4"])).toThrow(/cannot be overridden/);
    }
  });

  it("does not expose actual child stderr, command arguments or private paths on failure", async () => {
    let closed = false;
    const error = await runCutNativeProcess(process.execPath, ["-e", 'process.stderr.write("PRIVATE_METADATA /private/workspace/owner/source.mp4 https://private.example/?token=secret"); process.exit(23)'], { timeoutMs: 5_000, finished() { closed = true; } }).catch(error => error);
    expect(closed).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Native processing failed (exit 23)");
    expect(cutJobErrorDetail(error)).toBe("Native processing failed (exit 23)");
    const missing = await runCutNativeProcess(path.join(os.tmpdir(), "private-owner", "missing-native-binary"), ["private-token"], { timeoutMs: 5_000 }).catch(error => error);
    expect(missing.message).toBe("Native processing runtime is unavailable (ENOENT)");
  });

  it("closes stdin and retains bounded successful analysis output in memory", async () => {
    const output = await runCutNativeProcess(process.execPath, ["-e", 'process.stdin.resume(); process.stdin.on("end", () => process.stderr.write("x".repeat(20000) + "ANALYSIS_OK"))'], { timeoutMs: 5_000 });
    expect(output).toHaveLength(8_000);
    expect(output.endsWith("ANALYSIS_OK")).toBe(true);
  });

  it("renders real local video and audio, preserves progress and loudness analysis", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-native-io-test-"));
    try {
      const source = path.join(directory, "source.mp4"), output = path.join(directory, "render.mp4");
      await runCutNativeProcess("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=96x64:r=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.3", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", source], { timeoutMs: 10_000 });
      const progress: Array<{ complete: boolean; frame?: number }> = [];
      await runCutNativeProcess("ffmpeg", ["-v", "error", "-i", source, "-c:v", "libx264", "-threads", "1", "-c:a", "aac", output], { timeoutMs: 10_000, progress: value => progress.push(value) });
      const actual = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], { encoding: "utf8", windowsHide: true, timeout: 5_000 }));
      expect(actual.streams.find((stream: { codec_type: string }) => stream.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 96, height: 64, nb_frames: "3" });
      expect(actual.streams.some((stream: { codec_name: string }) => stream.codec_name === "aac")).toBe(true);
      expect(progress.some(value => value.complete && value.frame === 3)).toBe(true);
      const loudness = await runCutNativeProcess("ffmpeg", ["-hide_banner", "-nostats", "-i", source, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { timeoutMs: 10_000 });
      expect(loudness).toContain("Integrated loudness:");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("blocks direct and nested network sources on later inputs, with a real reachable control", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-native-network-test-"));
    let requests = 0;
    const server = createServer((_request, response) => { requests++; response.writeHead(404); response.end(); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const url = `http://127.0.0.1:${port}/private-segment.ts`;
      // Independent, unwrapped FFmpeg proves this endpoint is reachable. This
      // control contains only our loopback fixture; it never calls a provider.
      await expect(promisify(execFile)("ffmpeg", ["-v", "error", "-i", url, "-f", "null", "-"], { windowsHide: true, timeout: 5_000 })).rejects.toThrow();
      expect(requests).toBeGreaterThan(0);
      requests = 0;
      const playlist = path.join(directory, "private-playlist.m3u8");
      await writeFile(playlist, `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1,\n${url}\n#EXT-X-ENDLIST\n`);
      for (const source of [url, playlist]) {
        let closed = false;
        await expect(runCutNativeProcess("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-i", source, "-t", "0.1", "-f", "null", "-"], { timeoutMs: 5_000, finished() { closed = true; } })).rejects.toThrow(/^Native processing failed \(exit \d+\)$/);
        expect(closed).toBe(true);
        expect(requests).toBe(0);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains generated PNG sequences and decodes both authored frame colors", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-native-sequence-test-"));
    try {
      for (const [index, background] of ["#ff0000", "#0000ff"].entries()) {
        await sharp({ create: { width: 32, height: 32, channels: 4, background } }).png().toFile(path.join(directory, `frame-${String(index).padStart(6, "0")}.png`));
      }
      const output = path.join(directory, "sequence.mp4");
      await runCutNativeProcess("ffmpeg", ["-v", "error", "-framerate", "10", "-i", path.join(directory, "frame-%06d.png"), "-frames:v", "2", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", output], { timeoutMs: 10_000 });
      const actual = execFileSync("ffmpeg", ["-v", "error", "-i", output, "-frames:v", "2", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { windowsHide: true, timeout: 5_000 });
      expect(actual).toHaveLength(32 * 32 * 3 * 2);
      expect(actual[0]).toBeGreaterThan(245); expect(actual[2]).toBeLessThan(10);
      expect(actual[32 * 32 * 3]).toBeLessThan(10); expect(actual[32 * 32 * 3 + 2]).toBeGreaterThan(245);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
