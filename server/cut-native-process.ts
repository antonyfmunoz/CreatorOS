import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createCutProcessProgressParser, cutProcessProgressArgs, type CutProcessProgress } from "./cut-process-progress";
import { cutNativeMediaEnvironment } from "./cut-native-environment";

/** Every input is already materialized locally. Scope the policy to EACH input;
 * FFmpeg resets input options between -i arguments. This is not a filesystem
 * sandbox, nor permission to accept user-authored filter graphs or arguments. */
export function cutNativeInputArgs(args: string[]) {
  if (args.some(arg => /^-protocol_(?:white|black)list(?:[=:]|$)/.test(arg))) {
    throw new Error("Native input protocol policy cannot be overridden");
  }
  return args.flatMap(arg => arg === "-i" ? ["-protocol_whitelist", "file,pipe", arg] : [arg]);
}

/** Trusted native binaries only; this is not an executable user-code service. */
export function runCutNativeProcess(command: string, args: string[], options: {
  timeoutMs: number;
  signal?: AbortSignal;
  progress?: (progress: CutProcessProgress) => void;
  started?: (child: ChildProcessWithoutNullStreams) => void;
  finished?: (child: ChildProcessWithoutNullStreams) => void;
}) {
  return new Promise<string>((resolve, reject) => {
    // Registration and spawn are synchronous with this check. An abort while
    // preparing inputs cannot be lost simply because no child existed yet.
    if (options.signal?.aborted) { reject(new Error("Native job cancelled or lease lost")); return; }
    const withProgress = command === "ffmpeg" && options.progress;
    const inputArgs = command === "ffmpeg" ? cutNativeInputArgs(args) : args;
    const child = spawn(command, withProgress ? cutProcessProgressArgs(inputArgs) : inputArgs, { windowsHide: true, env: cutNativeMediaEnvironment() });
    // None of the trusted callers stream media on stdin. Close it so malformed
    // input cannot wait indefinitely for an interactive answer or pipe input.
    child.stdin.end();
    let failure: Error | undefined;
    let settled = false;
    let stderr = "";
    const abort = () => { failure ??= new Error("Native job cancelled or lease lost"); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { failure ??= new Error("Native processing timed out"); child.kill("SIGKILL"); }, options.timeoutMs);
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      options.finished?.(child);
      if (failure) reject(failure);
      else if (code === 0) resolve(stderr);
      // Stderr can contain private source names, paths, metadata or URLs. Only
      // successful trusted analysis (e.g. loudness) may consume it in memory.
      else reject(new Error(`Native processing failed (exit ${code ?? "signal"})`));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (withProgress) {
      const parse = createCutProcessProgressParser(withProgress);
      child.stdout.on("data", (chunk) => parse(String(chunk)));
    } else child.stdout.resume();
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      const category = error.code === "ENOENT" ? "ENOENT" : error.code === "EACCES" ? "EACCES" : "unavailable";
      failure ??= new Error(`Native processing runtime is unavailable (${category})`);
    });
    // Do not release capacity/delete input files until the actual child exits.
    child.on("close", finish);
    options.started?.(child);
    if (options.signal?.aborted) abort();
  });
}
