import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packer = readFileSync(new URL("../scripts/pack-creativesos-cli.mjs", import.meta.url), "utf8");

describe("standalone CreativesOS CLI package", () => {
  it("keeps the application root unpublished and exposes a deliberate CLI pack step", () => {
    expect(manifest.private).toBe(true);
    expect(manifest.scripts["cli:pack"]).toBe("node scripts/pack-creativesos-cli.mjs");
  });

  it("ships only the CLI and the inspected local code-runtime context", () => {
    expect(packer).toContain('name: "@creativesos/cli"');
    expect(packer).toContain('"cli/creativesos.mjs"');
    expect(packer).toContain('"mcp/creativesos-mcp.mjs"');
    expect(packer).toContain('"runtimes", "cut-code"');
    expect(packer).toContain('name !== "node_modules"');
    expect(packer).toContain('!name.endsWith(".test.mjs")');
    expect(packer).toContain('await rm(releaseRoot, { recursive: true, force: true })');
    expect(packer).toContain("creativesos node serve");
  });
});
