import { describe, expect, it } from "vitest";
import { validateCutCodeLockfile, validateCutCodeSourceArchive } from "../server/cut-code-package";

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const body = Buffer.from(value);
    const checksum = crc32(body);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(filename.length, 26); filename.copy(local, 30);
    locals.push(local, body);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42); filename.copy(central, 46);
    centrals.push(central);
    offset += local.length + body.length;
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
});
