import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../cli/creativesos.mjs", import.meta.url));

describe("CreativesOS CLI argument order", () => {
  it.each([
    ["--json", "node", "preview"],
    ["node", "--json", "preview"],
  ])("accepts global output flags around the local preview command: %s %s %s", (...argumentsInOrder: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...argumentsInOrder], { encoding: "utf8" });
    // No source is intentional: reaching the preview validator proves the
    // command was parsed, without needing Docker or private project assets.
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("provide a local source ZIP");
    expect(result.stdout).not.toContain("Usage:");
  });
});
