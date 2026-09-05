#!/usr/bin/env node
// CreativesOS CLI is intentionally a thin client over the versioned public
// API. It does not persist API keys. An explicitly paired CutStudio local node
// stores its own device credential in the current OS user profile only.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const version = "0.1.0";
const args = process.argv.slice(2);
const command = args.includes("--version") || args.includes("-v") ? "version" : args.find((value) => !value.startsWith("-")) ?? "help";
const json = args.includes("--json");
const baseUrl = (process.env.CREATIVESOS_API_URL ?? "https://creativesos.net/api/v1").replace(/\/$/, "");
const apiKey = process.env.CREATIVESOS_API_KEY?.trim();
const appUrl = (process.env.CREATIVESOS_APP_URL ?? baseUrl.replace(/\/api\/v1$/, "")).replace(/\/$/, "");
const nodeConfigPath = path.join(process.env.APPDATA ?? os.homedir(), "CreativesOS", "cut-local-node.json");

function usage(exitCode = 0) {
  console.log(`CreativesOS CLI ${version}

Usage: creativesos <command> [--json]

Read-only API commands:
  doctor       Validate local configuration and API reachability
  profile      Show the scoped business profile
  assets       List scoped assets
  products     List scoped products
  analytics    Show scoped analytics summary
  openapi      Print the current OpenAPI document

CutStudio local-node commands:
  node connect <pairing-code> [--name <name>]
                Pair this machine using a one-time code created in CutStudio.
  node status   Show this machine's paired local-node state (never its credential).
  node heartbeat [--status ready|busy|paused]
                Send an explicit availability heartbeat to CreativesOS.
  node disconnect
                Remove this machine's local credential. Revoke it in CutStudio too.

Environment:
  CREATIVESOS_API_URL   Versioned API base (default: https://creativesos.net/api/v1)
  CREATIVESOS_API_KEY   Scoped API key; required except for openapi

API keys are never persisted. Local-node pairing requires explicit device
approval and stores only a node credential in this OS user's profile. It does
not execute renders or grant cloud-compute access.`);
  process.exit(exitCode);
}

function fail(message, exitCode = 1) {
  console.error(`CreativesOS: ${message}`);
  process.exit(exitCode);
}

async function request(path, requiresKey = true) {
  if (requiresKey && !apiKey) fail("CREATIVESOS_API_KEY is required for this command. Create a scoped key in Developer settings.", 2);
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json", ...(requiresKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    fail("could not reach the API. Check CREATIVESOS_API_URL and your network.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) fail(body?.error?.message ?? `API request failed with ${response.status}.`);
  return body;
}

async function nodeRequest(pathname, { method = "GET", body, credential } = {}) {
  let response;
  try {
    response = await fetch(`${appUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail("could not reach CreativesOS. Check CREATIVESOS_APP_URL and your network.");
  }
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) fail(responseBody?.message ?? responseBody?.error?.message ?? `local-node request failed with ${response.status}.`);
  return responseBody;
}

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function loadNodeConfig(required = true) {
  try {
    return JSON.parse(await fs.readFile(nodeConfigPath, "utf8"));
  } catch (error) {
    if (!required && error?.code === "ENOENT") return null;
    fail(`this machine is not paired. Create a one-time code in CutStudio, then run \`creativesos node connect <pairing-code>\`.`);
  }
}

async function saveNodeConfig(config) {
  const directory = path.dirname(nodeConfigPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(nodeConfigPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function nodeCapabilities() {
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8", timeout: 5_000 }).status === 0;
  const operatingSystem = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  return {
    isolatedCode: docker,
    docker,
    maxConcurrentJobs: 1,
    cpuCores: Math.min(256, Math.max(1, os.cpus().length)),
    memoryMb: Math.min(1_048_576, Math.max(512, Math.floor(os.totalmem() / 1024 / 1024))),
    operatingSystem,
  };
}

async function runNodeCommand() {
  const subcommand = args[1];
  if (!subcommand || ["help", "--help", "-h"].includes(subcommand)) return usage();
  if (subcommand === "connect") {
    const pairingCode = args[2];
    if (!pairingCode || pairingCode.startsWith("-")) fail("provide the one-time pairing code: creativesos node connect <pairing-code>", 2);
    if (await loadNodeConfig(false)) fail("this machine is already paired. Run `creativesos node disconnect` before pairing it again.", 2);
    const name = option("--name") ?? `${os.hostname()} CutStudio node`;
    const result = await nodeRequest("/api/cut/nodes/claim", { method: "POST", body: { token: pairingCode, name, capabilities: nodeCapabilities() } });
    await saveNodeConfig({ version: 1, nodeId: result.node.id, name: result.node.name, appUrl, credential: result.credential, sequence: 0, pairedAt: new Date().toISOString() });
    print({ status: "paired", nodeId: result.node.id, name: result.node.name, app: appUrl, isolatedCode: result.node.capabilities.isolatedCode, next: "Run `creativesos node heartbeat` to mark this node ready." });
    return;
  }
  if (subcommand === "status") {
    const config = await loadNodeConfig();
    print({ status: "paired", nodeId: config.nodeId, name: config.name, app: config.appUrl, pairedAt: config.pairedAt, lastSequence: config.sequence ?? 0, credential: "stored locally (redacted)" });
    return;
  }
  if (subcommand === "heartbeat") {
    const config = await loadNodeConfig();
    const status = option("--status") ?? "ready";
    if (!new Set(["ready", "busy", "paused"]).has(status)) fail("--status must be ready, busy, or paused.", 2);
    const sequence = Number(config.sequence ?? 0) + 1;
    const result = await nodeRequest(`/api/cut/nodes/${config.nodeId}/heartbeat`, { method: "POST", credential: config.credential, body: { sequence, status } });
    await saveNodeConfig({ ...config, sequence, lastHeartbeatAt: new Date().toISOString() });
    print({ status: result.node.status, nodeId: result.node.id, sequence, lastSeenAt: result.node.lastSeenAt });
    return;
  }
  if (subcommand === "disconnect") {
    const config = await loadNodeConfig();
    await fs.rm(nodeConfigPath, { force: true });
    print({ status: "disconnected", nodeId: config.nodeId, next: "Revoke this node in CutStudio if the device is no longer trusted." });
    return;
  }
  usage(2);
}

function print(value) {
  if (json) return console.log(JSON.stringify(value, null, 2));
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) console.log(`${key}: ${typeof item === "object" ? JSON.stringify(item) : item}`);
    return;
  }
  console.log(String(value));
}

if (["help", "--help", "-h"].includes(command)) usage();
if (["--version", "-v", "version"].includes(command)) { console.log(version); process.exit(0); }
if (command === "node") {
  await runNodeCommand();
  process.exit(0);
}

const routes = { profile: "/profile", assets: "/assets", products: "/products", analytics: "/analytics/summary" };
if (command === "openapi") print(await request("/openapi.json", false));
else if (command === "doctor") {
  const document = await request("/openapi.json", false);
  print({ status: "ok", api: baseUrl, openapi: document?.openapi ?? "unknown", credential: apiKey ? "present (not validated)" : "not configured" });
} else if (routes[command]) print(await request(routes[command]));
else usage(2);
