import path from "node:path";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 5_000;

function normalizedArchivePath(value: string) {
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) throw new Error("Code capsule paths must be relative POSIX paths");
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../") || normalized !== value.replace(/^\.\//, "")) throw new Error("Code capsule paths cannot escape the source root");
  if (normalized.split("/").length > 32) throw new Error("Code capsule paths are nested too deeply");
  return normalized;
}

export function validateCutCodeSourceArchive(input: Buffer, entrypoint: string) {
  if (!input.length || input.length > MAX_SOURCE_BYTES) throw new Error("The code source ZIP exceeds the safe package limit");
  const minimumEocd = Math.max(0, input.length - 65_557);
  let eocd = -1;
  for (let offset = input.length - 22; offset >= minimumEocd; offset -= 1) {
    if (input.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("The code source is not a complete ZIP archive");
  const entryCount = input.readUInt16LE(eocd + 10);
  const centralSize = input.readUInt32LE(eocd + 12);
  const centralOffset = input.readUInt32LE(eocd + 16);
  if (entryCount < 1 || entryCount > MAX_ENTRIES || centralOffset + centralSize > eocd) throw new Error("The code source ZIP directory is invalid or too large");
  const entries: string[] = [];
  const knownEntries = new Set<string>();
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > input.length || input.readUInt32LE(offset) !== 0x02014b50) throw new Error("The code source ZIP directory is malformed");
    const flags = input.readUInt16LE(offset + 8);
    const method = input.readUInt16LE(offset + 10);
    const compressedBytes = input.readUInt32LE(offset + 20);
    const uncompressedBytes = input.readUInt32LE(offset + 24);
    const filenameBytes = input.readUInt16LE(offset + 28);
    const extraBytes = input.readUInt16LE(offset + 30);
    const commentBytes = input.readUInt16LE(offset + 32);
    const externalAttributes = input.readUInt32LE(offset + 38);
    const localHeaderOffset = input.readUInt32LE(offset + 42);
    if ((flags & 1) !== 0) throw new Error("Encrypted code source entries are not allowed");
    if (![0, 8].includes(method)) throw new Error("Code source entries must use stored or deflate compression");
    const nameStart = offset + 46;
    const nameEnd = nameStart + filenameBytes;
    if (nameEnd > input.length) throw new Error("The code source ZIP filename is truncated");
    const name = normalizedArchivePath(input.subarray(nameStart, nameEnd).toString("utf8"));
    if (knownEntries.has(name)) throw new Error("Duplicate code source paths are not allowed");
    knownEntries.add(name);
    if (localHeaderOffset + 30 > centralOffset || input.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error("The code source ZIP local header is invalid");
    const localMethod = input.readUInt16LE(localHeaderOffset + 8);
    const localFilenameBytes = input.readUInt16LE(localHeaderOffset + 26);
    const localExtraBytes = input.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localFilenameBytes;
    const dataStart = localNameEnd + localExtraBytes;
    if (localMethod !== method || localNameEnd > centralOffset || input.subarray(localNameStart, localNameEnd).toString("utf8") !== name || dataStart + compressedBytes > centralOffset) throw new Error("The code source ZIP local entry does not match its directory");
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if ((unixMode & 0xf000) === 0xa000) throw new Error("Symbolic links are not allowed in code source capsules");
    if (compressedBytes > 0 && uncompressedBytes / compressedBytes > 100) throw new Error("A code source entry exceeds the expansion-ratio limit");
    expandedBytes += uncompressedBytes;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error("The expanded code source exceeds the safe package limit");
    if (!name.endsWith("/")) entries.push(name);
    offset = nameEnd + extraBytes + commentBytes;
  }
  if (offset !== centralOffset + centralSize) throw new Error("The code source ZIP directory size does not match its entries");
  const canonicalEntrypoint = normalizedArchivePath(entrypoint);
  if (!entries.includes(canonicalEntrypoint)) throw new Error("The declared code entrypoint is missing from the source capsule");
  if (!entries.includes("package.json")) throw new Error("The code source capsule requires package.json at its root");
  return { entries, entryCount, compressedBytes: input.length, expandedBytes };
}

export function validateCutCodeLockfile(filename: string, input: Buffer) {
  if (!input.length || input.length > 2 * 1024 * 1024) throw new Error("The dependency lockfile exceeds the safe limit");
  const normalized = filename.toLowerCase();
  if (!["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"].includes(normalized)) throw new Error("The code capsule requires an npm, pnpm, or Yarn lockfile");
  const source = input.toString("utf8");
  if (normalized.endsWith(".json")) {
    let document: unknown;
    try { document = JSON.parse(source); } catch { throw new Error("The npm dependency lockfile is invalid JSON"); }
    if (!document || typeof document !== "object" || !("lockfileVersion" in document)) throw new Error("The npm dependency lockfile is missing lockfileVersion");
  } else if (source.trim().length < 16 || !/(lockfileVersion:|__metadata:|yarn lockfile)/i.test(source)) throw new Error("The dependency lockfile format is invalid");
  return { filename: normalized, byteLength: input.length };
}
