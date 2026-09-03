import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { cutSourceEditorLimits, validateCutSourceFiles, type CutSourceFile } from "@shared/cut-code-authoring";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 5_000;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  return value >>> 0;
});
function crc32(input: Buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < input.length; index++) value = (value >>> 8) ^ crcTable[(value ^ input[index]) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function archiveName(input: Buffer) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input); }
  catch { throw new Error("Code source names must use valid UTF-8"); }
}
function validateExtraFields(input: Buffer) {
  for (let offset = 0; offset < input.length;) {
    if (offset + 4 > input.length) throw new Error("Code source extra fields are truncated");
    const kind = input.readUInt16LE(offset); const length = input.readUInt16LE(offset + 2);
    if (offset + 4 + length > input.length) throw new Error("Code source extra fields are truncated");
    // A single bounded interpretation: no alternate 64-bit sizes or filenames.
    if ([0x0001, 0x7075].includes(kind)) throw new Error("ZIP64 and alternate Unicode paths are not supported in code capsules");
    offset += 4 + length;
  }
}

function normalizedArchivePath(value: string) {
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) throw new Error("Code capsule paths must be relative POSIX paths");
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../") || normalized !== value.replace(/^\.\//, "")) throw new Error("Code capsule paths cannot escape the source root");
  if (normalized.split("/").length > 32) throw new Error("Code capsule paths are nested too deeply");
  return normalized;
}

export function validateCutCodeSourceArchive(input: Buffer, entrypoint: string, inspect?: (name: string, body: Buffer) => void, inspection: "editor" | "manifest" = "editor") {
  if (!input.length || input.length > MAX_SOURCE_BYTES) throw new Error("The code source ZIP exceeds the safe package limit");
  const minimumEocd = Math.max(0, input.length - 65_557);
  let eocd = -1;
  for (let offset = input.length - 22; offset >= minimumEocd; offset -= 1) {
    if (input.readUInt32LE(offset) === 0x06054b50 && offset + 22 + input.readUInt16LE(offset + 20) === input.length) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("The code source is not a complete ZIP archive");
  const entryCount = input.readUInt16LE(eocd + 10);
  const centralSize = input.readUInt32LE(eocd + 12);
  const centralOffset = input.readUInt32LE(eocd + 16);
  if (input.readUInt16LE(eocd + 4) !== 0 || input.readUInt16LE(eocd + 6) !== 0 || input.readUInt16LE(eocd + 8) !== entryCount) throw new Error("Split or multidisk code archives are not supported");
  if (entryCount < 1 || entryCount > MAX_ENTRIES || centralOffset + centralSize !== eocd) throw new Error("The code source ZIP directory is invalid or too large");
  const entries: string[] = [];
  const knownEntries = new Set<string>();
  const records: Array<{ name: string; start: number; end: number; dataStart: number; dataEnd: number; size: number; method: number; checksum: number }> = [];
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocd || input.readUInt32LE(offset) !== 0x02014b50) throw new Error("The code source ZIP directory is malformed");
    const flags = input.readUInt16LE(offset + 8);
    const method = input.readUInt16LE(offset + 10);
    const compressedBytes = input.readUInt32LE(offset + 20);
    const uncompressedBytes = input.readUInt32LE(offset + 24);
    const filenameBytes = input.readUInt16LE(offset + 28);
    const extraBytes = input.readUInt16LE(offset + 30);
    const commentBytes = input.readUInt16LE(offset + 32);
    const externalAttributes = input.readUInt32LE(offset + 38);
    const localHeaderOffset = input.readUInt32LE(offset + 42);
    const checksum = input.readUInt32LE(offset + 16);
    if ((flags & 1) !== 0) throw new Error("Encrypted code source entries are not allowed");
    if ((flags & ~0x080e) !== 0 || input.readUInt16LE(offset + 34) !== 0) throw new Error("Unsupported code source flags or entry disk");
    if (![0, 8].includes(method)) throw new Error("Code source entries must use stored or deflate compression");
    const nameStart = offset + 46;
    const nameEnd = nameStart + filenameBytes;
    if (nameEnd + extraBytes + commentBytes > eocd) throw new Error("The code source ZIP filename or metadata is truncated");
    const rawName = archiveName(input.subarray(nameStart, nameEnd));
    const name = normalizedArchivePath(rawName);
    if (rawName !== name) throw new Error("Code source paths must use their canonical relative spelling");
    if (!(flags & 0x0800) && input.subarray(nameStart, nameEnd).some((byte) => byte >= 128)) throw new Error("Non-ASCII code source names must declare UTF-8 encoding");
    validateExtraFields(input.subarray(nameEnd, nameEnd + extraBytes));
    if (knownEntries.has(name)) throw new Error("Duplicate code source paths are not allowed");
    knownEntries.add(name);
    if (localHeaderOffset + 30 > centralOffset || input.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error("The code source ZIP local header is invalid");
    const localMethod = input.readUInt16LE(localHeaderOffset + 8);
    const localFilenameBytes = input.readUInt16LE(localHeaderOffset + 26);
    const localExtraBytes = input.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localFilenameBytes;
    const dataStart = localNameEnd + localExtraBytes;
    const dataEnd = dataStart + compressedBytes;
    if (localMethod !== method || input.readUInt16LE(localHeaderOffset + 6) !== flags || localNameEnd > centralOffset || archiveName(input.subarray(localNameStart, localNameEnd)) !== name || dataEnd > centralOffset) throw new Error("The code source ZIP local entry does not match its directory");
    validateExtraFields(input.subarray(localNameEnd, dataStart));
    let recordEnd = dataEnd;
    if (flags & 8) {
      for (const [position, expected] of [[14, checksum], [18, compressedBytes], [22, uncompressedBytes]]) {
        const localValue = input.readUInt32LE(localHeaderOffset + position);
        if (localValue !== 0 && localValue !== expected) throw new Error("The streamed code source local metadata conflicts with its directory");
      }
      // Accept both standard 32-bit descriptor forms and bind all three fields.
      const candidates = [dataEnd, dataEnd + 4].filter((start) => start === dataEnd || (dataEnd + 4 <= centralOffset && input.readUInt32LE(dataEnd) === 0x08074b50));
      const descriptor = candidates.find((start) => start + 12 <= centralOffset && input.readUInt32LE(start) === checksum && input.readUInt32LE(start + 4) === compressedBytes && input.readUInt32LE(start + 8) === uncompressedBytes);
      if (descriptor === undefined) throw new Error("The code source data descriptor does not match its directory");
      recordEnd = descriptor + 12;
    } else if (input.readUInt32LE(localHeaderOffset + 14) !== checksum || input.readUInt32LE(localHeaderOffset + 18) !== compressedBytes || input.readUInt32LE(localHeaderOffset + 22) !== uncompressedBytes) throw new Error("The code source ZIP local sizes or checksum do not match its directory");
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if ((unixMode & 0xf000) === 0xa000) throw new Error("Symbolic links are not allowed in code source capsules");
    if ((unixMode & 0xf000) && ![0x8000, 0x4000].includes(unixMode & 0xf000)) throw new Error("Special filesystem entries are not allowed in code capsules");
    if ((((unixMode & 0xf000) === 0x4000 || (externalAttributes & 0x10) !== 0) && !name.endsWith("/")) || ((unixMode & 0xf000) === 0x8000 && name.endsWith("/"))) throw new Error("Code source entry type and path disagree");
    if ((name.endsWith("/") && uncompressedBytes !== 0) || (method === 0 && compressedBytes !== uncompressedBytes)) throw new Error("Stored or directory code source sizes are invalid");
    if (compressedBytes > 0 && uncompressedBytes / compressedBytes > 100) throw new Error("A code source entry exceeds the expansion-ratio limit");
    expandedBytes += uncompressedBytes;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error("The expanded code source exceeds the safe package limit");
    if (!name.endsWith("/")) entries.push(name);
    // Text inspection has a smaller budget than executable-package admission.
    // Reject declared over-budget expansion before inflating any entry.
    if (inspect && inspection === "editor" && (uncompressedBytes > cutSourceEditorLimits.fileBytes || expandedBytes > cutSourceEditorLimits.totalBytes || entries.length > cutSourceEditorLimits.files)) throw new Error("This archive exceeds the text editor limits; no files were discarded.");
    if (inspect && inspection === "manifest" && name === "package.json" && uncompressedBytes > 256 * 1024) throw new Error("package.json exceeds 256 KiB.");
    records.push({ name, start: localHeaderOffset, end: recordEnd, dataStart, dataEnd, size: uncompressedBytes, method, checksum });
    offset = nameEnd + extraBytes + commentBytes;
  }
  if (offset !== centralOffset + centralSize) throw new Error("The code source ZIP directory size does not match its entries");
  const canonicalEntrypoint = normalizedArchivePath(entrypoint);
  if (!entries.includes(canonicalEntrypoint)) throw new Error("The declared code entrypoint is missing from the source capsule");
  if (!entries.includes("package.json")) throw new Error("The code source capsule requires package.json at its root");
  let previousEnd = 0;
  for (const record of records.sort((left, right) => left.start - right.start)) {
    if (record.start < previousEnd) throw new Error("Code source local entries may not overlap");
    previousEnd = record.end;
    const segments = record.name.replace(/\/$/, "").split("/");
    for (let depth = 1; depth < segments.length; depth++) if (knownEntries.has(segments.slice(0, depth).join("/"))) throw new Error("A code source file cannot also be a parent directory");
    if (record.name.endsWith("/") && knownEntries.has(record.name.slice(0, -1))) throw new Error("Code source file and directory paths conflict");
    const compressed = input.subarray(record.dataStart, record.dataEnd);
    let body: Buffer;
    if (record.method === 0) body = compressed;
    else {
      try {
        // Enforce actual inflated bytes, not just attacker-supplied ZIP lengths.
        const result = inflateRawSync(compressed, { info: true, maxOutputLength: Math.max(1, record.size) }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
        if (result.engine.bytesWritten !== compressed.length) throw new Error("Trailing compressed data");
        body = result.buffer;
      } catch { throw new Error("Code source deflate data is corrupt or exceeds its declared size"); }
    }
    if (body.length !== record.size || crc32(body) !== record.checksum) throw new Error("The code source entry content does not match its size and CRC32");
    if (!record.name.endsWith("/") && (inspection === "editor" || record.name === "package.json")) inspect?.(record.name, body);
  }
  return { entries, entryCount, compressedBytes: input.length, expandedBytes };
}

export function readCutCodeSourceFiles(input: Buffer, entrypoint: string): CutSourceFile[] {
  const files: CutSourceFile[] = []; let total = 0;
  validateCutCodeSourceArchive(input, entrypoint, (name, body) => {
    total += body.length;
    if (files.length >= cutSourceEditorLimits.files || body.length > cutSourceEditorLimits.fileBytes || total > cutSourceEditorLimits.totalBytes) throw new Error("This archive exceeds the text editor limits. Keep using ZIP import for larger or binary packages.");
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body); }
    catch { throw new Error("This package contains binary files. Use ZIP import; no files were discarded."); }
    files.push({ path: name, content });
  });
  validateCutSourceFiles(files, entrypoint);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
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
