import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionSource = readFileSync(new URL("../server/cut-studio-production.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../client/src/components/cut/CutStudioCreativeRuntime.tsx", import.meta.url), "utf8");

describe("CutStudio executable source status", () => {
  it("distinguishes the configured paired-local runner from a hosted arbitrary-code service", () => {
    expect(productionSource).toContain('execution: codeExecutionConfigured() ? "paired_local_node" : "not_activated"');
    expect(runtimeSource).toContain("run it only through a paired trusted local node");
    expect(runtimeSource).toContain("Hosted arbitrary-code execution remains unavailable.");
    expect(runtimeSource).not.toContain("Public execution remains unavailable.");
  });
});
