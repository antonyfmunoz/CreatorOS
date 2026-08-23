#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { machineGroup, machinesFromPayload } from "./audit-live-fly-topology.mjs";

export const compactConfig = "fly.toml";
export const scaledConfig = "infra/fly.production-scaled.toml";

const expectedScaledGroups = new Set(["web", "media", "cut"]);
const transitionConfirmations = Object.freeze({
  [compactConfig]: "APPLY_COMPACT_TOPOLOGY",
  [scaledConfig]: "APPLY_SCALED_TOPOLOGY",
});

export function resolveFlyConfig(payload, { override = "", confirmation = "" } = {}) {
  const groups = new Set(machinesFromPayload(payload).map(machineGroup));
  groups.delete("unknown");
  let observedConfig = "";
  if (groups.size === 1 && groups.has("app")) observedConfig = compactConfig;
  const onlyScaledGroups = groups.size > 0 && [...groups].every((group) => expectedScaledGroups.has(group));
  if (onlyScaledGroups && groups.has("web")) observedConfig = scaledConfig;
  if (!observedConfig) {
    const observed = [...groups].sort().join(",") || "none";
    throw new Error(`Refusing to deploy over ambiguous Fly process groups: ${observed}`);
  }

  if (override) {
    const requiredConfirmation = transitionConfirmations[override];
    if (!requiredConfirmation) throw new Error(`Unsupported Fly deployment config override: ${override}`);
    if (confirmation !== requiredConfirmation) {
      throw new Error(`Topology transition to ${override} requires confirmation ${requiredConfirmation}`);
    }
    return override;
  }
  return observedConfig;
}

function argumentValue(prefix) {
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function main() {
  const inputPath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (!inputPath) throw new Error("Usage: resolve-live-fly-config.mjs <fly-machines.json> [--override=<path>] [--confirm=<phrase>]");
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const resolved = resolveFlyConfig(payload, {
    override: argumentValue("--override="),
    confirmation: argumentValue("--confirm="),
  });
  process.stdout.write(`${resolved}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
