import fs from "node:fs/promises";
import { validateCutStudioLottie } from "../shared/cut-studio-lottie";
import { CUT_STUDIO_RIVE_MAX_BYTES, validateCutStudioRiveBytes } from "../shared/cut-studio-rive";

export const CUT_NATIVE_LOTTIE_MAX_BYTES = 5 * 1024 * 1024;

/** Revalidate the exact local bytes at execution, not only library admission. */
export async function readCutNativeAnimationSource(kind: "lottie" | "rive", sourcePath: string) {
  const limit = kind === "lottie" ? CUT_NATIVE_LOTTIE_MAX_BYTES : CUT_STUDIO_RIVE_MAX_BYTES;
  const handle = await fs.open(sourcePath, "r");
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw new Error("Native animation source exceeds its byte budget");
    // The extra byte detects growth without ever allocating an unbounded file.
    // Reading and statting one handle also prevents pathname replacement races.
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const read = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size) throw new Error("Native animation source changed during validation");
    bytes = buffer.subarray(0, offset);
  } finally { await handle.close(); }
  if (kind === "lottie") {
    const validated = validateCutStudioLottie(JSON.parse(bytes.toString("utf8")) as unknown);
    return { kind, animationData: validated.animationData } as const;
  }
  validateCutStudioRiveBytes(bytes);
  return { kind, bytes } as const;
}
