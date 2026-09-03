import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { probeCutMedia, readCutProbeOutput } from "../server/cut-native-probe";

describe("bounded native media inspection", () => {
  const budget = { timeoutMs: 5_000, maxBytes: 1024 };
  it("drains private stderr without including it in output", async () => {
    const output = await readCutProbeOutput(process.execPath, ["-e", 'process.stderr.write("private-source ".repeat(100000)); process.stdout.write("ok")'], budget);
    expect(output).toBe("ok");
  });
  it("rejects overflowing metadata and confirms the actual child exits", async () => {
    let pid: number | undefined, closed = false;
    await expect(readCutProbeOutput(process.execPath, ["-e", 'process.stdout.write("x".repeat(65536)); setInterval(() => {}, 1000)'], {
      ...budget, started(child) { pid = child.pid; }, finished(child) { closed = child.exitCode !== null || child.signalCode !== null; },
    })).rejects.toThrow(/metadata budget/);
    expect(closed).toBe(true); expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid!, 0)).toThrow();
  });
  it("honors cancellation before spawn and at process registration", async () => {
    const before = new AbortController(); before.abort(); const started = vi.fn();
    await expect(readCutProbeOutput(process.execPath, [], { ...budget, signal: before.signal, started })).rejects.toThrow(/cancelled/);
    expect(started).not.toHaveBeenCalled();
    const during = new AbortController(); let pid: number | undefined;
    await expect(readCutProbeOutput(process.execPath, ["-e", 'setInterval(() => {}, 1000)'], { ...budget, signal: during.signal, started(child) { pid = child.pid; during.abort(); } })).rejects.toThrow(/cancelled/);
    expect(() => process.kill(pid!, 0)).toThrow();
  });
  it("bounds process lifetime and reports runtime failures without private output", async () => {
    let pid: number | undefined;
    await expect(readCutProbeOutput(process.execPath, ["-e", 'setInterval(() => {}, 1000)'], { ...budget, timeoutMs: 100, started(child) { pid = child.pid; } })).rejects.toThrow(/timed out/);
    expect(() => process.kill(pid!, 0)).toThrow();
    await expect(readCutProbeOutput("creativesos-missing-probe-test-binary", [], budget)).rejects.toThrow("The media inspection runtime is unavailable");
    await expect(readCutProbeOutput(process.execPath, ["-e", 'process.stderr.write("private-path-token"); process.exit(1)'], budget)).rejects.toThrow("The source media could not be inspected");
  });
  it("preserves actual video geometry, display rotation and source-audio detection", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-probe-test-"));
    try {
      const source = path.join(directory, "source.mp4"); const rotated = path.join(directory, "rotated.mp4");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=96x64:r=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.2", "-vf", "setsar=4/3", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", source], { windowsHide: true, stdio: "pipe", timeout: 10_000 });
      execFileSync("ffmpeg", ["-v", "error", "-display_rotation:v:0", "90", "-i", source, "-c", "copy", rotated], { windowsHide: true, stdio: "pipe", timeout: 10_000 });
      const independent = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", rotated], { encoding: "utf8", windowsHide: true, stdio: "pipe", timeout: 10_000 }));
      expect(independent.streams[0].side_data_list.some((row: { rotation?: number }) => row.rotation === 90)).toBe(true);
      const actual = await probeCutMedia(rotated);
      expect(actual).toMatchObject({ hasAudio: true, hasVideo: true, videoGeometry: { width: 96, height: 64, sampleAspectRatio: "4:3" } });
      expect(Math.abs(actual.videoGeometry!.rotation)).toBe(90);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("does not fetch a remote segment named inside an uploaded playlist", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cut-probe-network-test-"));
    let requests = 0;
    const server = createServer((_request, response) => { requests++; response.writeHead(404); response.end(); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const input = path.join(directory, "source.m3u8");
      await writeFile(input, `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1,\nhttp://127.0.0.1:${port}/private-segment.ts\n#EXT-X-ENDLIST\n`);
      await expect(probeCutMedia(input)).rejects.toThrow(/could not be inspected/);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
