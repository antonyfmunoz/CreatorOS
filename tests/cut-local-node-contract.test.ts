import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cutLocalNodeCapabilitiesSchema, cutLocalNodeClaimSchema, cutLocalNodeHeartbeatSchema, cutLocalNodeJobCompletionSchema, cutLocalNodeJobFailureSchema, cutLocalNodeJobHeartbeatSchema } from "../shared/cut-node";

const brokerSource = readFileSync(new URL("../server/cut-local-nodes.ts", import.meta.url), "utf8");
const cliSource = readFileSync(new URL("../cli/creativesos.mjs", import.meta.url), "utf8");
const recoverySource = readFileSync(new URL("../server/cut-job-recovery.ts", import.meta.url), "utf8");
const creativeRuntimeSource = readFileSync(new URL("../client/src/components/cut/CutStudioCreativeRuntime.tsx", import.meta.url), "utf8");
const desktopSource = readFileSync(new URL("../desktop/main.mjs", import.meta.url), "utf8");
const packageManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

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
    expect(() => cutLocalNodeCapabilitiesSchema.parse({ ...capabilities, maxConcurrentJobs: 2 })).toThrow();
    expect(() => cutLocalNodeCapabilitiesSchema.parse({ ...capabilities, memoryMb: 511 })).toThrow();
    expect(() => cutLocalNodeClaimSchema.parse({ token: "short", name: "", capabilities })).toThrow();
  });

  it("only accepts ordered, explicit availability states", () => {
    expect(cutLocalNodeHeartbeatSchema.parse({ sequence: 1, status: "ready" })).toEqual({ sequence: 1, status: "ready" });
    expect(() => cutLocalNodeHeartbeatSchema.parse({ sequence: 0, status: "ready" })).toThrow();
    expect(() => cutLocalNodeHeartbeatSchema.parse({ sequence: 2, status: "rendering" })).toThrow();
  });

  it("bounds a local job lease, progress receipt, and failure detail", () => {
    const leaseToken = "56cf3d28-331a-4a8c-bd3e-ae8e56c5e44b";
    expect(cutLocalNodeJobHeartbeatSchema.parse({ leaseToken, progress: 0.4, detail: "Rendering frames" })).toMatchObject({ leaseToken, progress: 0.4 });
    expect(cutLocalNodeJobCompletionSchema.parse({ leaseToken, storageKey: "creativesos/production/private/users/1/cut-code-render/output.mp4", sha256: "a".repeat(64), filename: "cutstudio-code-render.mp4" })).toMatchObject({ leaseToken, filename: "cutstudio-code-render.mp4" });
    expect(cutLocalNodeJobFailureSchema.parse({ leaseToken, detail: "Renderer stopped" })).toMatchObject({ code: "local_node_render_failed" });
    expect(() => cutLocalNodeJobHeartbeatSchema.parse({ leaseToken: "not-a-lease", progress: 2 })).toThrow();
    expect(() => cutLocalNodeJobCompletionSchema.parse({ leaseToken, storageKey: "x", sha256: "bad", filename: "../output.mp4" })).toThrow();
  });

  it("enforces one server-owned local render lease and keeps a paired origin stable", () => {
    expect(brokerSource).toContain('eq(cutStudioLocalNodes.status, "ready")');
    expect(brokerSource).toContain('status: "busy"');
    expect(brokerSource).toContain("This node still owns an active local render lease");
    expect(brokerSource).toContain('status: "ready", updatedAt: new Date()');
    expect(cliSource).toContain("origin = appUrl");
    expect(cliSource).toContain("origin: config.appUrl");
    expect(brokerSource).toContain("cutStudioProjectMedia");
    expect(brokerSource).toContain('descriptor.assetKind === "video" || descriptor.assetKind === "image"');
    expect(brokerSource).toContain('["mov", "video/quicktime"]');
    expect(brokerSource).toContain('["m4a", "audio/mp4"]');
    expect(brokerSource).toContain('runtime.mode === "audio" ? "audio" : "image"');
    expect(brokerSource).toContain("localNodeHeartbeatMaxAgeMs = 90_000");
    expect(brokerSource).toContain("This node heartbeat is stale");
  });

  it("releases only an expired paired-node lock and discards its temporary object", () => {
    expect(recoverySource).toContain("removeStoredAsset(temporaryStorageKey, \"private\")");
    expect(recoverySource).toContain('eq(cutStudioLocalNodes.status, "busy")');
    expect(recoverySource).toContain("leaseExpiresAt} > clock_timestamp()");
  });

  it("preserves bounded execution budgets when creating an explicit retry", () => {
    expect(recoverySource).toContain("maxAttempts: job.maxAttempts");
    expect(recoverySource).toContain("maxDispatchAttempts: job.maxDispatchAttempts");
  });

  it("does not offer a knowingly unavailable local render", () => {
    expect(creativeRuntimeSource).toContain('const localCodeExecutionReady = runtime?.compositionRuntime.isolatedCode === "configured"');
    expect(creativeRuntimeSource).toContain("Execution setup required");
    expect(creativeRuntimeSource).toContain("ready={localCodeExecutionReady}");
    expect(creativeRuntimeSource).toContain("disabled={busy || !ready}");
  });

  it("lets a successful local-node command drain its fetch handles before process exit", () => {
    expect(cliSource).toContain('if (command === "node") await runNodeCommand();');
    expect(cliSource).not.toContain('await runNodeCommand();\n  process.exit(0);');
  });

  it("keeps legacy or missing output budgets inside the hardened runtime ceiling", () => {
    expect(cliSource).toContain("Number.isSafeInteger(declaredMaximumOutputBytes)");
    expect(cliSource).toContain("declaredMaximumOutputBytes >= 1024");
    expect(cliSource).toContain(": 64 * 1024 * 1024;");
  });

  it("offers a foreground, user-started local worker without expanding its single-job authority", () => {
    expect(cliSource).toContain("node serve [--poll-ms <2000-60000>]");
    expect(cliSource).toContain('if (subcommand === "serve")');
    expect(cliSource).toContain('await runNodeService();');
    expect(cliSource).toContain('await executeOneLocalJob(config);');
    expect(cliSource).toContain('sendNodeHeartbeat(config, "paused")');
    expect(cliSource).toContain("maxConcurrentJobs: 1");
    expect(cliSource).toContain("async function runOneNodeJob()");
    expect(cliSource).toContain("await sendNodeHeartbeat(config, \"ready\")");
    expect(cliSource).toContain("await sendNodeHeartbeat(config, \"paused\")");
  });

  it("keeps the packaged desktop runtime outside the application archive", () => {
    expect(cliSource).toContain("CREATIVESOS_CUT_CODE_RUNTIME_DIR");
    expect(desktopSource).toContain('path.join(process.resourcesPath, "cut-code-runtime")');
    expect(packageManifest.build.extraResources).toEqual(expect.arrayContaining([expect.objectContaining({ from: "runtimes/cut-code", to: "cut-code-runtime" })]));
    expect(packageManifest.build.files).toContain("!node_modules/**/*");
  });
});
