import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createCutProcessProgressParser, cutProcessProgressArgs, type CutProcessProgress } from "./cut-process-progress";

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
    const child = spawn(command, withProgress ? cutProcessProgressArgs(args) : args, { windowsHide: true });
    let failure: Error | undefined;
    let settled = false;
    let stderr = "";
    const abort = () => { failure ??= new Error("Native job cancelled or lease lost"); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { failure ??= new Error(`${command} timed out`); child.kill("SIGKILL"); }, options.timeoutMs);
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      options.finished?.(child);
      if (failure) reject(failure);
      else if (code === 0) resolve(stderr);
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-1_000)}`));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (withProgress) {
      const parse = createCutProcessProgressParser(withProgress);
      child.stdout.on("data", (chunk) => parse(String(chunk)));
    } else child.stdout.resume();
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-8_000); });
    child.on("error", (error) => { failure ??= error; });
    // Do not release capacity/delete input files until the actual child exits.
    child.on("close", finish);
    options.started?.(child);
    if (options.signal?.aborted) abort();
  });
}
