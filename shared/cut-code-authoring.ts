// Source is data here: this module never imports, evaluates or installs it.
export type CutSourceFile = { path: string; content: string };
export const cutSourceEditorLimits = { files: 64, fileBytes: 256 * 1024, totalBytes: 2 * 1024 * 1024 } as const;
const encode = (value: string) => new TextEncoder().encode(value);

export function assertCutSourceTextBudget(files: CutSourceFile[]) {
  let bytes = 0;
  for (const file of files) {
    const size = encode(file.content).length;
    if (size > cutSourceEditorLimits.fileBytes) throw new Error("Each editable source file is limited to 256 KiB.");
    bytes += size;
    if (bytes > cutSourceEditorLimits.totalBytes) throw new Error("Editable source packages are limited to 2 MiB of text.");
  }
}

export function validateCutSourceFiles(files: CutSourceFile[], entrypoint: string) {
  if (!files.length || files.length > cutSourceEditorLimits.files) throw new Error("The source editor supports 1–64 text files.");
  const names = new Set<string>(); let bytes = 0;
  for (const file of files) {
    if (!file.path || file.path.length > 240 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(file.path)
      || file.path.split("/").some((part) => part === "." || part === "..") || file.path.split("/").length > 32
      || !/\.(tsx?|jsx?|mjs|cjs|css|json|md|txt)$/.test(file.path)) throw new Error("Use a relative TSX, TS, JS, CSS, JSON, Markdown or text filename.");
    if (names.has(file.path)) throw new Error("Source filenames must be unique.");
    names.add(file.path);
    const body = encode(file.content);
    if (body.length > cutSourceEditorLimits.fileBytes) throw new Error("Each editable source file is limited to 256 KiB.");
    if (file.content.includes("\0") || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body) !== file.content) throw new Error("Source files must be valid UTF-8 text without NUL characters.");
    bytes += body.length;
  }
  if (bytes > cutSourceEditorLimits.totalBytes) throw new Error("Editable source packages are limited to 2 MiB of text.");
  for (const name of Array.from(names)) {
    const parts = name.split("/");
    for (let n = 1; n < parts.length; n++) if (names.has(parts.slice(0, n).join("/"))) throw new Error("A source file cannot also be a folder.");
  }
  if (!/\.tsx?$/.test(entrypoint) || !names.has(entrypoint)) throw new Error("Choose an existing TS or TSX entrypoint.");
  const manifest = files.find((file) => file.path === "package.json");
  if (!manifest) throw new Error("Include package.json at the source root.");
  let parsed: unknown;
  try { parsed = JSON.parse(manifest.content.replace(/^\uFEFF/, "")); } catch { throw new Error("package.json must contain valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("package.json must contain an object.");
  return { bytes, files: files.length };
}

function crc32(input: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < input.length; index++) { crc ^= input[index]; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

// Deterministic stored ZIP: no compression library, script execution, filesystem
// extraction, timestamps or platform-dependent ordering. Server CRC/path checks
// remain authoritative when the resulting private package is registered.
export function buildCutSourceZip(files: CutSourceFile[], entrypoint: string) {
  validateCutSourceFiles(files, entrypoint);
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const name = encode(file.path); const body = encode(file.content); const crc = crc32(body);
    const local = new Uint8Array(30 + name.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, body.length, true); lv.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, body.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    locals.push(local, body); centrals.push(central); offset += local.length + body.length;
  }
  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let position = 0;
  for (const part of [...locals, ...centrals, end]) { result.set(part, position); position += part.length; }
  return result;
}

export function starterCutSource(): CutSourceFile[] {
  return [
    { path: "package.json", content: JSON.stringify({ name: "cut-composition", private: true, type: "module", dependencies: { react: "18.3.1" } }, null, 2) + "\n" },
    { path: "src/index.tsx", content: "import React from 'react';\nimport { FullFrame, useFrame } from '@creativesos/cut';\nimport './style.css';\n\nexport default function Composition() {\n  const frame = useFrame();\n  return <FullFrame className=\"title\">\n    <h1 style={{ transform: `translateY(${Math.max(0, 30 - frame)}px)` }}>Your story</h1>\n  </FullFrame>;\n}\n" },
    { path: "src/style.css", content: ".title { display: flex; background: #09090b; color: #1d9bf0; align-items: center; justify-content: center; font-family: sans-serif; }\n" },
  ];
}
