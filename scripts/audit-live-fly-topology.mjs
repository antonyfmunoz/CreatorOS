#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const targetTopology = Object.freeze({
  web: { minRunning: 2, cpuKind: "shared", cpus: 1, memoryMb: 1024 },
  media: { minRunning: 1, cpuKind: "performance", cpus: 2, memoryMb: 4096 },
  cut: { minRunning: 1, cpuKind: "performance", cpus: 4, memoryMb: 8192 },
});

const activeStates = new Set(["created", "starting", "started", "replacing", "suspended"]);
const runningStates = new Set(["starting", "started", "replacing"]);

function machinesFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["machines", "Machines", "data"]) if (Array.isArray(payload?.[key])) return payload[key];
  throw new Error("Fly topology payload does not contain a machine array");
}

function machineGroup(machine) {
  return machine?.config?.metadata?.fly_process_group
    ?? machine?.config?.env?.FLY_PROCESS_GROUP
    ?? machine?.process_group
    ?? machine?.processGroup
    ?? "unknown";
}

function imageIdentity(machine) {
  return machine?.image_ref?.digest
    ?? machine?.image_ref?.repository
    ?? machine?.config?.image
    ?? machine?.image
    ?? "unknown";
}

function guest(machine) {
  return machine?.config?.guest ?? machine?.guest ?? {};
}

export function auditTopology(payload, target = targetTopology) {
  const machines = machinesFromPayload(payload).filter((machine) => activeStates.has(String(machine?.state ?? "unknown")));
  const summaries = {};
  const violations = [];
  const knownGroups = new Set(Object.keys(target));
  const unknownGroups = new Set();

  for (const group of knownGroups) {
    const expected = target[group];
    const groupMachines = machines.filter((machine) => machineGroup(machine) === group);
    const running = groupMachines.filter((machine) => runningStates.has(String(machine?.state ?? "unknown")));
    const mismatchedResources = groupMachines.filter((machine) => {
      const config = guest(machine);
      return config.cpu_kind !== expected.cpuKind
        || Number(config.cpus) !== expected.cpus
        || Number(config.memory_mb) !== expected.memoryMb;
    }).length;
    summaries[group] = {
      active: groupMachines.length,
      running: running.length,
      targetMinRunning: expected.minRunning,
      mismatchedResources,
    };
    if (running.length < expected.minRunning) violations.push(`${group}:running ${running.length}/${expected.minRunning}`);
    if (mismatchedResources) violations.push(`${group}:resource-mismatch ${mismatchedResources}`);
  }

  for (const machine of machines) {
    const group = machineGroup(machine);
    if (!knownGroups.has(group)) unknownGroups.add(group);
  }
  if (unknownGroups.size) violations.push(`unknown-process-groups:${[...unknownGroups].sort().join(",")}`);

  const images = new Set(machines.map(imageIdentity));
  const unknownImageCount = machines.filter((machine) => imageIdentity(machine) === "unknown").length;
  if (unknownImageCount) violations.push(`unknown-image-identity:${unknownImageCount}`);
  if (images.size > 1) violations.push(`mixed-release-images:${images.size}`);

  return {
    schemaVersion: "creativesos.fly-topology-audit.v1",
    status: violations.length ? "drift" : "qualified",
    observedAt: new Date().toISOString(),
    machineCount: machines.length,
    groups: summaries,
    unknownProcessGroups: [...unknownGroups].sort(),
    distinctReleaseImages: images.size,
    violations,
  };
}

function main() {
  const inputPath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (!inputPath) throw new Error("Usage: audit-live-fly-topology.mjs <fly-machines.json> [--enforce]");
  const report = auditTopology(JSON.parse(readFileSync(inputPath, "utf8")));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes("--enforce") && report.status !== "qualified") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
