import { describe, expect, it } from "vitest";
import { readCutCodeSourceFiles, validateCutCodeLockfile, validateCutCodeSourceArchive } from "../server/cut-code-package";
import { deflateRawSync } from "node:zlib";

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Record<string, string | Buffer>, options: { deflate?: boolean; descriptor?: "signed" | "unsigned"; trailingDeflate?: boolean } = {}) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const compressed = options.deflate ? Buffer.concat([deflateRawSync(body), ...(options.trailingDeflate ? [Buffer.from("extra")] : [])]) : body;
    const flags = options.descriptor ? 8 : 0; const method = options.deflate ? 8 : 0;
    const checksum = crc32(body);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(options.descriptor ? 0 : checksum, 14); local.writeUInt32LE(options.descriptor ? 0 : compressed.length, 18); local.writeUInt32LE(options.descriptor ? 0 : body.length, 22); local.writeUInt16LE(filename.length, 26); filename.copy(local, 30);
    const descriptor = Buffer.alloc(options.descriptor ? options.descriptor === "signed" ? 16 : 12 : 0);
    if (options.descriptor) {
      const start = options.descriptor === "signed" ? 4 : 0;
      if (start) descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(checksum, start); descriptor.writeUInt32LE(compressed.length, start + 4); descriptor.writeUInt32LE(body.length, start + 8);
    }
    locals.push(local, compressed, descriptor);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42); filename.copy(central, 46);
    centrals.push(central);
    offset += local.length + compressed.length + descriptor.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrals.length, 8); eocd.writeUInt16LE(centrals.length, 10); eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

describe("CutStudio isolated code packages", () => {
  it("accepts a pinned source archive without executing it", () => {
    const packageZip = zip({ "package.json": "{}", "src/index.tsx": "export default null" });
    expect(validateCutCodeSourceArchive(packageZip, "src/index.tsx")).toMatchObject({ entryCount: 2, entries: ["package.json", "src/index.tsx"] });
    expect(validateCutCodeLockfile("package-lock.json", Buffer.from('{"lockfileVersion":3,"packages":{}}'))).toMatchObject({ filename: "package-lock.json" });
  });

  it("fails closed for missing entrypoints, traversal, encryption, and unpinned dependencies", () => {
    const packageZip = zip({ "package.json": "{}", "src/other.tsx": "export default null" });
    expect(() => validateCutCodeSourceArchive(packageZip, "src/index.tsx")).toThrow(/entrypoint/i);
    expect(() => validateCutCodeSourceArchive(zip({ "package.json": "{}", "../escape.tsx": "bad" }), "../escape.tsx")).toThrow(/escape|relative/i);
    const encrypted = zip({ "package.json": "{}", "src/index.tsx": "ok" });
    encrypted.writeUInt16LE(1, encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 8);
    expect(() => validateCutCodeSourceArchive(encrypted, "src/index.tsx")).toThrow(/encrypted/i);
    expect(() => validateCutCodeLockfile("package-lock.json", Buffer.from("{}"))).toThrow(/lockfileVersion/i);
  });

  it("verifies deflated content and both streamed data-descriptor forms", () => {
    const entries = { "package.json": "{}", "src/index.tsx": "export default function Example(){return <div>Actual bytes</div>}" };
    for (const descriptor of [undefined, "signed", "unsigned"] as const) {
      expect(validateCutCodeSourceArchive(zip(entries, { deflate: true, descriptor }), "src/index.tsx").expandedBytes).toBe(Object.values(entries).reduce((sum, value) => sum + Buffer.byteLength(value), 0));
    }
  });

  it("rejects damaged bytes, local flags and inconsistent descriptors", () => {
    const entries = { "package.json": "{}", "src/index.tsx": "actual source" };
    const damaged = zip(entries); damaged[30 + Buffer.byteLength("package.json")] ^= 1;
    expect(() => validateCutCodeSourceArchive(damaged, "src/index.tsx")).toThrow(/CRC32/);
    const flags = zip(entries); flags.writeUInt16LE(8, 6);
    expect(() => validateCutCodeSourceArchive(flags, "src/index.tsx")).toThrow(/local entry/);
    const descriptor = zip(entries, { deflate: true, descriptor: "signed" });
    descriptor[descriptor.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08])) + 4] ^= 1;
    expect(() => validateCutCodeSourceArchive(descriptor, "src/index.tsx")).toThrow(/data descriptor/);
  });

  it("bounds actual inflation even when the archive lies about expanded size", () => {
    const forged = zip({ "package.json": "{}", "src/index.tsx": "A".repeat(8192) }, { deflate: true });
    const first = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const central = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), first + 4);
    const local = forged.readUInt32LE(central + 42);
    forged.writeUInt32LE(8, central + 24); forged.writeUInt32LE(8, local + 22);
    expect(() => validateCutCodeSourceArchive(forged, "src/index.tsx")).toThrow(/exceeds its declared size/);
    expect(() => validateCutCodeSourceArchive(zip({ "package.json": "{}", "src/index.tsx": "source" }, { deflate: true, trailingDeflate: true }), "src/index.tsx")).toThrow(/deflate data/);
  });

  it("rejects trailing data, split disks and file/directory ambiguity", () => {
    const entries = { "package.json": "{}", "src/index.tsx": "source" };
    const trailing = Buffer.concat([zip(entries), Buffer.from("garbage")]);
    expect(() => validateCutCodeSourceArchive(trailing, "src/index.tsx")).toThrow(/complete ZIP/);
    const split = zip(entries); split.writeUInt16LE(1, split.length - 22 + 4);
    expect(() => validateCutCodeSourceArchive(split, "src/index.tsx")).toThrow(/multidisk/);
    expect(() => validateCutCodeSourceArchive(zip({ ...entries, src: "also a file" }), "src/index.tsx")).toThrow(/parent directory/);
    expect(() => validateCutCodeSourceArchive(zip({ ...entries, "src/": "content" }), "src/index.tsx")).toThrow(/directory code source sizes/);
  });

  it("accepts a bounded archive comment but rejects malformed Unicode filenames", () => {
    const original = zip({ "package.json": "{}", "src/index.tsx": "source" });
    const comment = Buffer.from("A bounded comment"); original.writeUInt16LE(comment.length, original.length - 2);
    expect(validateCutCodeSourceArchive(Buffer.concat([original, comment]), "src/index.tsx").entryCount).toBe(2);
    const invalid = zip({ "package.json": "{}", "src/index.tsx": "source" });
    const central = invalid.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); invalid[central + 46] = 255;
    expect(() => validateCutCodeSourceArchive(invalid, "src/index.tsx")).toThrow(/UTF-8/);
  });

  it("refuses binary, oversized and unsupported files without discarding them from editable packages", () => {
    const base = { "package.json": "{}", "src/index.tsx": "export default () => null;" };
    expect(() => readCutCodeSourceFiles(zip({ ...base, "source.txt": Buffer.from([0xff]) }), "src/index.tsx")).toThrow(/binary/);
    expect(() => readCutCodeSourceFiles(zip({ ...base, "source.txt": "\0" }), "src/index.tsx")).toThrow(/NUL/);
    expect(() => readCutCodeSourceFiles(zip({ ...base, "source.bin": "ASCII is not a supported extension" }), "src/index.tsx")).toThrow(/filename/);
    expect(() => readCutCodeSourceFiles(zip({ ...base, "source.txt": "x".repeat(262145) }), "src/index.tsx")).toThrow(/editor limits/);
    expect(readCutCodeSourceFiles(zip({ ...base, "notes.txt": "ordinary compressed notes" }, { deflate: true }), "src/index.tsx")).toHaveLength(3);
  });

  it("manifest-only inspection preserves binary ZIP admission without expanding text editor limits", () => {
    const entries = { "package.json": "{}", "src/index.tsx": "export default null", "private.bin": Buffer.alloc(300_000, 255) };
    const seen: string[] = [];
    expect(validateCutCodeSourceArchive(zip(entries), "src/index.tsx", (name) => seen.push(name), "manifest").entryCount).toBe(3);
    expect(seen).toEqual(["package.json"]);
    expect(() => readCutCodeSourceFiles(zip(entries), "src/index.tsx")).toThrow(/text editor/);
    expect(() => validateCutCodeSourceArchive(zip({ ...entries, "package.json": " ".repeat(262145) }), "src/index.tsx", () => undefined, "manifest")).toThrow(/256 KiB/);
  });

  it("rejects overlapping local payloads and conflicting filesystem types", () => {
    const nested = zip({ "src/index.tsx": "nested source" });
    const nestedCentral = nested.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const archive = zip({ "package.json": "{}", "container.bin": nested.subarray(0, nestedCentral), "src/index.tsx": "nested source" });
    const centralStart = archive.readUInt32LE(archive.length - 22 + 16);
    const firstEnd = centralStart + 46 + Buffer.byteLength("package.json");
    const sourceCentral = firstEnd + 46 + Buffer.byteLength("container.bin");
    const containerLocal = archive.readUInt32LE(firstEnd + 42);
    archive.writeUInt32LE(containerLocal + 30 + Buffer.byteLength("container.bin"), sourceCentral + 42);
    expect(() => validateCutCodeSourceArchive(archive, "src/index.tsx")).toThrow(/overlap/);
    const typed = zip({ "package.json": "{}", "src/index.tsx": "source" });
    const central = typed.readUInt32LE(typed.length - 22 + 16); typed.writeUInt32LE(0x10, central + 38);
    expect(() => validateCutCodeSourceArchive(typed, "src/index.tsx")).toThrow(/type and path/);
  });
});
