import { spawn } from "node:child_process";
import { z } from "zod";

export const cutStillRequestSchema = z.object({
  frame: z.string().regex(/^\d{1,7}$/).transform(Number).pipe(z.number().int().min(0).max(432_000)).default("0"),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
}).strict();

export class CutStillError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parseCutStillProbe(value: unknown) {
  const parsed = z.object({ streams: z.array(z.object({
    width: z.number().int().positive(), height: z.number().int().positive(),
    avg_frame_rate: z.string(), r_frame_rate: z.string(), nb_frames: z.string(),
  })) }).safeParse(value);
  const stream = parsed.success ? parsed.data.streams[0] : undefined;
  if (!stream || stream.width * stream.height > 3840 * 2160) throw new CutStillError(422, "A video render up to 4K is required for frame export.");
  const ratio = /^(\d+)\/(\d+)$/.exec(stream.avg_frame_rate);
  const fps = ratio && Number(ratio[2]) > 0 ? Number(ratio[1]) / Number(ratio[2]) : NaN;
  const frameCount = /^\d+$/.test(stream.nb_frames) ? Number(stream.nb_frames) : NaN;
  if (!Number.isFinite(fps) || fps < 1 || fps > 60 || stream.avg_frame_rate !== stream.r_frame_rate || !Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount / fps > 7_201) throw new CutStillError(422, "The render must have a supported constant frame rate and frame count.");
  return { width: stream.width, height: stream.height, fps, frameCount };
}

export function cutStillArguments(inputPath: string, outputPath: string, frame: number, fps: number) {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > 432_000 || !Number.isFinite(fps) || fps < 1 || fps > 60) throw new CutStillError(400, "The requested frame is invalid.");
  return ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1", "-ss", (frame / fps).toFixed(9), "-i", inputPath, "-map", "0:v:0", "-frames:v", "1", "-an", "-sn", "-dn", "-threads", "1", "-f", "image2", "-update", "1", outputPath];
}

function inspectProcess(command: string, args: string[], signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) return reject(new CutStillError(499, "Frame export cancelled."));
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(output);
    };
    const abort = () => { child.kill("SIGKILL"); };
    const timer = setTimeout(abort, 45_000);
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { output += String(chunk); if (output.length > 65_536) abort(); });
    child.on("error", () => finish(new CutStillError(503, "The frame export runtime is unavailable.")));
    child.on("close", (code) => finish(code === 0 && !signal.aborted ? undefined : new CutStillError(signal.aborted ? 499 : 422, signal.aborted ? "Frame export cancelled." : "The requested frame could not be decoded.")));
  });
}

export async function renderCutStill(inputPath: string, outputPath: string, frame: number, signal: AbortSignal) {
  const output = await inspectProcess("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames", "-of", "json", inputPath], signal);
  let metadata: ReturnType<typeof parseCutStillProbe>;
  try { metadata = parseCutStillProbe(JSON.parse(output)); } catch (error) { throw error instanceof CutStillError ? error : new CutStillError(422, "The video metadata is invalid."); }
  if (frame >= metadata.frameCount) throw new CutStillError(416, `Choose a frame from 0 to ${metadata.frameCount - 1}.`);
  await inspectProcess("ffmpeg", cutStillArguments(inputPath, outputPath, frame, metadata.fps), signal);
  return metadata;
}

/** Per-process hard cap complements the per-account request limiter. */
export function cutStillAdmission(maximum = 2) {
  let active = 0;
  return () => {
    if (active >= maximum) return null;
    active += 1;
    let released = false;
    return () => { if (!released) { released = true; active -= 1; } };
  };
}
