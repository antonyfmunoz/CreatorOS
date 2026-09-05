import { describe, expect, it } from "vitest";
import { cutLocalNodeCapabilitiesSchema, cutLocalNodeClaimSchema, cutLocalNodeHeartbeatSchema } from "../shared/cut-node";

const capabilities = {
  isolatedCode: true,
  docker: true,
  maxConcurrentJobs: 1,
  cpuCores: 8,
  memoryMb: 16_384,
  operatingSystem: "windows" as const,
};

describe("CutStudio local-node contract", () => {
  it("accepts a bounded local executor capability declaration", () => {
    expect(cutLocalNodeCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(cutLocalNodeClaimSchema.parse({ token: "a".repeat(43), name: "Primary workstation", capabilities })).toMatchObject({ name: "Primary workstation", capabilities });
  });

  it("rejects capability inflation and malformed pairing input", () => {
    expect(() => cutLocalNodeCapabilitiesSchema.parse({ ...capabilities, maxConcurrentJobs: 5 })).toThrow();
    expect(() => cutLocalNodeCapabilitiesSchema.parse({ ...capabilities, memoryMb: 511 })).toThrow();
    expect(() => cutLocalNodeClaimSchema.parse({ token: "short", name: "", capabilities })).toThrow();
  });

  it("only accepts ordered, explicit availability states", () => {
    expect(cutLocalNodeHeartbeatSchema.parse({ sequence: 1, status: "ready" })).toEqual({ sequence: 1, status: "ready" });
    expect(() => cutLocalNodeHeartbeatSchema.parse({ sequence: 0, status: "ready" })).toThrow();
    expect(() => cutLocalNodeHeartbeatSchema.parse({ sequence: 2, status: "rendering" })).toThrow();
  });
});
