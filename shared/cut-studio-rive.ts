const RIVE_MAGIC = [0x52, 0x49, 0x56, 0x45] as const;
export const CUT_STUDIO_RIVE_MAX_BYTES = 5 * 1024 * 1024;

function bytesFrom(input: ArrayBuffer | ArrayBufferView) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

export function validateCutStudioRiveBytes(input: ArrayBuffer | ArrayBufferView) {
  const bytes = bytesFrom(input);
  if (bytes.byteLength < 8) throw new Error("The Rive file is truncated");
  if (bytes.byteLength > CUT_STUDIO_RIVE_MAX_BYTES) throw new Error("The Rive file exceeds the safe limit");
  if (RIVE_MAGIC.some((value, index) => bytes[index] !== value)) throw new Error("The Rive file header is invalid");
  const formatVersion = bytes[4];
  if (!formatVersion || formatVersion > 64) throw new Error("The Rive file format version is unsupported");
  return { byteLength: bytes.byteLength, formatVersion };
}
