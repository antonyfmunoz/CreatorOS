import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { cutNativeInputArgs } from "./cut-native-process";
import { cutNativeInputPolicyArgs } from "./cut-native-input-policy";
import { readCutProbeOutput } from "./cut-native-probe";

/** Trusted ingest commands only. Apply the same self-contained input boundary
 * before metadata, thumbnail, waveform, transcode or HLS-output processing.
 * Existing output packaging remains supported; uploaded manifests do not. */
export async function runManagedMediaProcess(command: "ffmpeg" | "ffprobe", args: string[], timeoutMs: number, lifecycle: {
  signal?: AbortSignal;
  started?: (child: ChildProcessWithoutNullStreams) => void;
  finished?: (child: ChildProcessWithoutNullStreams) => void;
} = {}) {
  const guarded = cutNativeInputArgs(args);
  try {
    return await readCutProbeOutput(command, command === "ffprobe" ? [...cutNativeInputPolicyArgs(), ...guarded] : guarded, {
      timeoutMs, maxBytes: 2_000_000, ...lifecycle,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "Media inspection timed out";
    const cancelled = lifecycle.signal?.aborted === true;
    // The shared primitive strips credential inheritance, bounds total output,
    // drains private stderr and awaits actual child exit before releasing work.
    throw Object.assign(new Error(cancelled ? "Media processing cancelled or lease lost" : timedOut ? "Media processing timed out" : "Media processing failed"), {
      code: cancelled ? "media_cancelled" : timedOut ? "media_timeout" : "media_process_failed",
    });
  }
}
