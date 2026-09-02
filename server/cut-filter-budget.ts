import { availableParallelism } from "node:os";

/** Filter scheduling only: source decoders and output codec settings stay intact. */
export function cutFilterThreadArgs(environment: NodeJS.ProcessEnv = process.env, parallelism = availableParallelism()): [string, string] {
  const configured = environment.CUT_FILTER_THREADS;
  if (configured !== undefined) {
    if (!/^[1-9][0-9]?$/.test(configured) || Number(configured) > 32) throw new Error("CUT_FILTER_THREADS must be an integer between 1 and 32");
    return ["-filter_complex_threads", configured];
  }
  if (!Number.isInteger(parallelism) || parallelism < 1) throw new Error("Native filter CPU availability is invalid");
  return ["-filter_complex_threads", String(Math.min(2, parallelism))];
}

export function cutSimpleFilterThreadArgs(environment: NodeJS.ProcessEnv = process.env, parallelism = availableParallelism()): [string, string] {
  return ["-filter_threads", cutFilterThreadArgs(environment, parallelism)[1]];
}
