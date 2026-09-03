import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cutNativeMediaEnvironment } from "./cut-native-environment";

/** Trusted executable/arguments only; never a user-supplied command endpoint. */
export function readCutProbeOutput(command: string, args: string[], options: {
  signal?: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  started?: (child: ChildProcessWithoutNullStreams) => void;
  finished?: (child: ChildProcessWithoutNullStreams) => void;
}) {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) throw new Error("Invalid native probe budget");
  return new Promise<string>((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("Media inspection cancelled or lease lost")); return; }
    const child = spawn(command, args, { windowsHide: true, env: cutNativeMediaEnvironment() });
    child.stdin.end();
    let failure: Error | undefined;
    let settled = false;
    let bytes = 0;
    const chunks: Buffer[] = [];
    const stop = (message: string) => { failure ??= new Error(message); child.kill("SIGKILL"); };
    const abort = () => stop("Media inspection cancelled or lease lost");
    const timer = setTimeout(() => stop("Media inspection timed out"), options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (value: Buffer) => {
      if (failure) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.length;
      if (bytes > options.maxBytes) { chunks.length = 0; stop("Media inspection exceeded its metadata budget"); }
      else chunks.push(chunk);
    });
    // Do not buffer or expose private source paths/metadata in diagnostic text.
    child.stderr.resume();
    child.on("error", () => { failure ??= new Error("The media inspection runtime is unavailable"); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      options.finished?.(child);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error("The source media could not be inspected"));
      else resolve(Buffer.concat(chunks, bytes).toString("utf8"));
    });
    options.started?.(child);
    if (options.signal?.aborted) abort();
  });
}

export async function probeCutMedia(sourcePath: string, signal?: AbortSignal) {
  const stdout = await readCutProbeOutput("ffprobe", [
    "-v", "error", "-protocol_whitelist", "file,pipe", "-threads", "1", "-show_entries",
    "stream=codec_type,width,height,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation",
    "-of", "json", sourcePath,
  ], { signal, timeoutMs: 30_000, maxBytes: 1_048_576 });
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed.streams)) throw new Error("Invalid streams");
    const streams = parsed.streams as Array<{ codec_type?: string; width?: number; height?: number; sample_aspect_ratio?: string; side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } }>;
    const video = streams.find((stream) => stream.codec_type === "video");
    return { hasVideo: Boolean(video), hasAudio: streams.some((stream) => stream.codec_type === "audio"), videoGeometry: video ? { width: video.width, height: video.height, sampleAspectRatio: video.sample_aspect_ratio, rotation: video.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? Number(video.tags?.rotate ?? 0) } : null };
  } catch {
    throw new Error("The source media inspection returned invalid metadata");
  }
}
