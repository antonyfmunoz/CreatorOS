import { describe, expect, it } from "vitest";
import { buildCutSourceZip, starterCutSource, validateCutSourceFiles } from "../shared/cut-code-authoring";
import { readCutCodeSourceFiles, validateCutCodeSourceArchive } from "../server/cut-code-package";

describe("data-only source authoring", () => {
  it("round trips all text through the authoritative archive reader and CRC checks", () => {
    const files = [...starterCutSource(), { path: "notes.txt", content: "Creative café 🎬\n\ufeffkeep this BOM" }];
    const zip = buildCutSourceZip(files, "src/index.tsx");
    expect(validateCutCodeSourceArchive(Buffer.from(zip), "src/index.tsx").entryCount).toBe(4);
    expect(readCutCodeSourceFiles(Buffer.from(zip), "src/index.tsx")).toEqual([...files].sort((a, b) => a.path < b.path ? -1 : 1));
    expect(buildCutSourceZip([...files].reverse(), "src/index.tsx")).toEqual(zip);
    const corrupt = Buffer.from(zip); corrupt["package.json".length + 30] ^= 1;
    expect(() => readCutCodeSourceFiles(corrupt, "src/index.tsx")).toThrow(/CRC32/);
  });
  it("does not evaluate source or install package scripts", () => {
    const files = starterCutSource();
    files[1].content = "throw new Error('never execute source while authoring')";
    files[0].content = JSON.stringify({ scripts: { postinstall: "exit 99" } });
    expect(readCutCodeSourceFiles(Buffer.from(buildCutSourceZip(files, "src/index.tsx")), "src/index.tsx")).toHaveLength(3);
  });
  it.each(["../index.tsx", "/index.tsx", "C:/index.tsx", "src\\index.tsx", "src//index.tsx", "src/./index.tsx", "src/../index.tsx", "src/payload.html", "x\0.tsx"])("rejects an unsafe or unsupported path %s", (path) => {
    expect(() => buildCutSourceZip([...starterCutSource(), { path, content: "" }], "src/index.tsx")).toThrow();
  });
  it("rejects duplicate paths, parent files and invalid or missing manifest/entrypoint", () => {
    const files = starterCutSource();
    expect(() => validateCutSourceFiles([...files, files[1]], "src/index.tsx")).toThrow(/unique/);
    expect(() => validateCutSourceFiles([...files, { path: "folder.ts", content: "" }, { path: "folder.ts/child.ts", content: "" }], "src/index.tsx")).toThrow(/folder/);
    expect(() => validateCutSourceFiles(files, "missing.tsx")).toThrow(/entrypoint/);
    expect(() => validateCutSourceFiles(files.slice(1), "src/index.tsx")).toThrow(/package.json/);
    expect(() => validateCutSourceFiles([{ path: "package.json", content: "[]" }, files[1]], "src/index.tsx")).toThrow(/object/);
    expect(() => validateCutSourceFiles([{ path: "package.json", content: "{" }, files[1]], "src/index.tsx")).toThrow(/JSON/);
  });
  it("enforces actual UTF-8 bytes, file count and aggregate editor bounds", () => {
    const files = starterCutSource();
    expect(() => buildCutSourceZip([...files, { path: "large.txt", content: "é".repeat(131073) }], "src/index.tsx")).toThrow(/256 KiB/);
    expect(() => buildCutSourceZip([...files, ...Array.from({ length: 62 }, (_, n) => ({ path: `${n}.txt`, content: "" }))], "src/index.tsx")).toThrow(/64/);
    expect(() => buildCutSourceZip([...files, ...Array.from({ length: 8 }, (_, n) => ({ path: `${n}.txt`, content: "x".repeat(262144) }))], "src/index.tsx")).toThrow(/2 MiB/);
    expect(() => buildCutSourceZip([...files, { path: "bad.txt", content: "\ud800" }], "src/index.tsx")).toThrow(/UTF-8/);
    expect(() => buildCutSourceZip([...files, { path: "bad.txt", content: "\0" }], "src/index.tsx")).toThrow(/NUL/);
  });
});
