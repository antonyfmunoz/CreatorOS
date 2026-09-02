import { availableParallelism } from "node:os";

/** Per video decoder/encoder, not an aggregate process CPU or memory limit. */
export function cutCodecThreadArgs(environment: NodeJS.ProcessEnv = process.env, parallelism = availableParallelism()): [string, string] {
  const configured = environment.CUT_CODEC_THREADS;
  if (configured !== undefined) {
    if (!/^[1-9][0-9]?$/.test(configured) || Number(configured) > 32) throw new Error("CUT_CODEC_THREADS must be an integer between 1 and 32");
    return ["-threads:v", configured];
  }
  if (!Number.isInteger(parallelism) || parallelism < 1) throw new Error("Native codec CPU availability is invalid");
  return ["-threads:v", String(Math.min(2, parallelism))];
}
