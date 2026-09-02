import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const qs = require("qs") as { parse(value: string, options: Record<string, unknown>): unknown; stringify(value: unknown): string };

describe("patched query parser without a server-major upgrade", () => {
  it("installs and locks patched qs copies while retaining Express 4", () => {
    expect(require("express/package.json").version).toMatch(/^4\./);
    const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
    const versions = [require("qs/package.json").version, ...Object.entries(lock.packages).filter(([name]) => /(^|\/)node_modules\/qs$/.test(name)).map(([, entry]) => (entry as { version: string }).version)];
    expect(versions.length).toBeGreaterThan(1);
    for (const version of versions) { const [major, minor] = version.split(".").map(Number); expect(major > 6 || (major === 6 && minor >= 16)).toBe(true); }
  });
  it("serializes parsed constructor-shaped data without calling an untrusted buffer test", () => {
    for (const options of [{ plainObjects: true }, { allowPrototypes: true }]) {
      const parsed = qs.parse("customer[constructor][isBuffer]=not-callable&customer[name]=Example", options);
      expect(() => qs.stringify(parsed)).not.toThrow();
      expect(qs.stringify(parsed)).toContain("Example");
    }
  });
  it("preserves nested arrays, values and real Buffer serialization", () => {
    const input = { filters: { tags: ["art", "film"], page: "2" }, bytes: Buffer.from("ok") };
    const encoded = qs.stringify(input);
    expect(qs.parse(encoded, {})).toEqual({ filters: { tags: ["art", "film"], page: "2" }, bytes: "ok" });
  });
});
