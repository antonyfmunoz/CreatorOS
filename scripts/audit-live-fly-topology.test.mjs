import assert from "node:assert/strict";
import test from "node:test";
import { auditTopology } from "./audit-live-fly-topology.mjs";

function machine(group, state, cpuKind, cpus, memoryMb, image = "sha256:release-a") {
  return {
    state,
    image_ref: { digest: image },
    config: {
      env: { FLY_PROCESS_GROUP: group },
      guest: { cpu_kind: cpuKind, cpus, memory_mb: memoryMb },
    },
  };
}

test("qualifies the intended web, media, and cut topology", () => {
  const report = auditTopology([
    machine("web", "started", "shared", 1, 1024),
    machine("web", "started", "shared", 1, 1024),
    machine("media", "started", "performance", 2, 4096),
    machine("cut", "started", "performance", 4, 8192),
  ]);
  assert.equal(report.status, "qualified");
  assert.deepEqual(report.violations, []);
  assert.equal(report.distinctReleaseImages, 1);
});

test("reports legacy groups, insufficient capacity, resource drift, and mixed images", () => {
  const report = auditTopology({ machines: [
    machine("app", "started", "shared", 1, 512),
    machine("web", "suspended", "shared", 1, 512, "sha256:release-b"),
  ] });
  assert.equal(report.status, "drift");
  assert.ok(report.violations.includes("web:running 0/2"));
  assert.ok(report.violations.includes("web:resource-mismatch 1"));
  assert.ok(report.violations.includes("media:running 0/1"));
  assert.ok(report.violations.includes("cut:running 0/1"));
  assert.ok(report.violations.includes("unknown-process-groups:app"));
  assert.ok(report.violations.includes("mixed-release-images:2"));
});
