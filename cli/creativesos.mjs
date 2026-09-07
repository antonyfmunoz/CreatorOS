#!/usr/bin/env node
// CreativesOS CLI is intentionally a thin client over the versioned public
// API. It does not persist API keys. An explicitly paired CutStudio local node
// stores its own device credential in the current OS user profile only.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
const version = "0.1.0";
const args = process.argv.slice(2);
const command = args.includes("--version") || args.includes("-v") ? "version" : args.find((value) => !value.startsWith("-")) ?? "help";
const json = args.includes("--json");
const baseUrl = (process.env.CREATIVESOS_API_URL ?? "https://creativesos.net/api/v1").replace(/\/$/, "");
const apiKey = process.env.CREATIVESOS_API_KEY?.trim();
const appUrl = (process.env.CREATIVESOS_APP_URL ?? baseUrl.replace(/\/api\/v1$/, "")).replace(/\/$/, "");
const nodeConfigPath = path.join(process.env.APPDATA ?? os.homedir(), "CreativesOS", "cut-local-node.json");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  node work     Claim and execute at most one approved code-render job locally.
  node serve [--poll-ms <2000-60000>]
                Keep this foreground process available for approved local jobs.
  node disconnect
                Remove this machine's local credential. Revoke it in CutStudio too.

Environment:
  CREATIVESOS_API_URL   Versioned API base (default: https://creativesos.net/api/v1)
  CREATIVESOS_API_KEY   Scoped API key; required except for openapi

API keys are never persisted. Local-node pairing requires explicit device
approval and stores only a node credential in this OS user's profile. It does
not execute renders unless \`node work\` or the foreground \`node serve\` command
is explicitly invoked. It never grants cloud-compute access.`);
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

async function nodeRequest(pathname, { method = "GET", body, credential, origin = appUrl } = {}) {
  let response;
  try {
    response = await fetch(`${origin}${pathname}`, {
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

async function rawNodeRequest(pathname, { method = "GET", body, credential, origin = appUrl } = {}) {
  let response;
  try {
    response = await fetch(`${origin}${pathname}`, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Could not reach CreativesOS.");
  }
  const responseBody = await response.json().catch(() => null);
  if (!response.ok && response.status !== 204) throw new Error(responseBody?.message ?? `Local-node request failed with ${response.status}.`);
  return { response, body: responseBody };
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

function localRuntimeImage() {
  const configured = process.env.CREATIVESOS_CUT_CODE_IMAGE ?? "creativesos-cut-code:production-candidate";
  if (/^sha256:[a-f0-9]{64}$/i.test(configured)) return configured;
  const inspected = spawnSync("docker", ["image", "inspect", configured, "--format", "{{.Id}}"], { encoding: "utf8", timeout: 10_000 });
  const image = inspected.status === 0 ? inspected.stdout.trim() : "";
  if (!/^sha256:[a-f0-9]{64}$/i.test(image)) throw new Error("No approved local CutStudio runtime image is available. Build or set CREATIVESOS_CUT_CODE_IMAGE to an immutable image ID.");
  return image;
}

function localRuntimeDirectory() {
  const configured = process.env.CREATIVESOS_CUT_CODE_RUNTIME_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(repositoryRoot, "runtimes", "cut-code");
}

async function downloadPrivateSource(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error("The short-lived code source download was unavailable.");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 25 * 1024 * 1024) throw new Error("The code source exceeds the local runtime limit.");
  const source = Buffer.from(await response.arrayBuffer());
  if (!source.length || source.length > 25 * 1024 * 1024) throw new Error("The code source exceeds the local runtime limit.");
  return source;
}

async function executeOneLocalJob(config) {
  const origin = config.appUrl;
  const claimed = await rawNodeRequest("/api/cut/nodes/jobs/claim", { method: "POST", credential: config.credential, origin });
  if (claimed.response.status === 204) return { status: "idle" };
  const payload = claimed.body;
  const jobId = payload?.job?.id;
  const leaseToken = payload?.lease?.token;
  if (typeof jobId !== "string" || typeof leaseToken !== "string" || typeof payload?.source?.archive?.url !== "string" || typeof payload?.output?.uploadUrl !== "string") throw new Error("CreativesOS returned an invalid local render lease.");
  try {
    const [source, runtime] = await Promise.all([downloadPrivateSource(payload.source.archive.url), Promise.resolve(payload.job.runtime)]);
    const image = localRuntimeImage();
    const runtimeDirectory = localRuntimeDirectory();
    const { renderIsolated } = await import(pathToFileURL(path.join(runtimeDirectory, "host.mjs")).href);
    const heartbeat = setInterval(() => {
      void rawNodeRequest(`/api/cut/nodes/jobs/${jobId}/heartbeat`, { method: "POST", credential: config.credential, origin, body: { leaseToken, progress: 0.5, detail: "Rendering in isolated local container" } }).catch(() => undefined);
    }, 60_000);
    let rendered;
    try {
      const limits = payload.limits;
      // Historic capsules may predate the 64 MiB runtime artifact ceiling.
      // Their declared maximum is an upper bound, never an entitlement to make
      // the local sandbox exceed its fixed safe output limit.
      const maximumOutputBytes = Math.min(Number(limits?.maximumOutputBytes), 64 * 1024 * 1024);
      rendered = await renderIsolated({ request: runtime, source, image, timeoutMs: limits?.maximumCpuMs, memoryMb: limits?.maximumMemoryMb, maximumOutputBytes });
    } finally {
      clearInterval(heartbeat);
    }
    const artifactSha256 = crypto.createHash("sha256").update(rendered.artifact).digest("hex");
    if (artifactSha256 !== rendered.receipt?.artifactSha256) throw new Error("The local runtime receipt did not match its artifact.");
    const upload = await fetch(payload.output.uploadUrl, { method: "PUT", headers: { "Content-Type": payload.output.mimeType }, body: rendered.artifact, signal: AbortSignal.timeout(90_000) });
    if (!upload.ok) throw new Error("The temporary artifact upload was rejected.");
    const completed = await rawNodeRequest(`/api/cut/nodes/jobs/${jobId}/complete`, { method: "POST", credential: config.credential, origin, body: { leaseToken, storageKey: payload.output.storageKey, sha256: artifactSha256, filename: payload.output.filename } });
    if (!completed.response.ok) throw new Error("CreativesOS did not accept the local render artifact.");
    return { status: "completed", jobId, artifactId: completed.body?.artifact?.id, image };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 400) : "Local isolated rendering failed";
    await rawNodeRequest(`/api/cut/nodes/jobs/${jobId}/fail`, { method: "POST", credential: config.credential, origin, body: { leaseToken, code: "local_node_render_failed", detail } }).catch(() => undefined);
    throw error;
  }
}

function pollInterval() {
  const supplied = option("--poll-ms");
  if (supplied === undefined) return 5_000;
  if (!/^\d+$/.test(supplied)) fail("--poll-ms must be a whole number between 2000 and 60000.", 2);
  const value = Number(supplied);
  if (!Number.isSafeInteger(value) || value < 2_000 || value > 60_000) fail("--poll-ms must be between 2000 and 60000.", 2);
  return value;
}

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function sendNodeHeartbeat(config, status) {
  const sequence = Number(config.sequence ?? 0) + 1;
  const result = await nodeRequest(`/api/cut/nodes/${config.nodeId}/heartbeat`, {
    method: "POST", credential: config.credential, origin: config.appUrl, body: { sequence, status },
  });
  const next = { ...config, sequence, lastHeartbeatAt: new Date().toISOString() };
  await saveNodeConfig(next);
  return { config: next, node: result.node };
}

async function runNodeService() {
  let config = await loadNodeConfig();
  const interval = pollInterval();
  let stopping = false;
  const stop = () => { stopping = true; };
  // Stopping is graceful: finish or fail the current isolated job through its
  // normal lease path, then advertise paused rather than abandoning a lease.
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  ({ config } = await sendNodeHeartbeat(config, "ready"));
  print({ status: "serving", nodeId: config.nodeId, pollMs: interval, message: "Waiting for approved local CutStudio jobs. Press Ctrl+C to pause after the current job." });
  let lastHeartbeatAt = Date.now();
  try {
    while (!stopping) {
      try {
        const result = await executeOneLocalJob(config);
        if (result.status === "completed") print(result);
      } catch (error) {
        print({ status: "failed", message: error instanceof Error ? error.message : "Local isolated rendering failed" });
      }
      if (stopping) break;
      if (Date.now() - lastHeartbeatAt >= 45_000) {
        ({ config } = await sendNodeHeartbeat(config, "ready"));
        lastHeartbeatAt = Date.now();
      }
      await sleep(interval);
    }
  } finally {
    try {
      ({ config } = await sendNodeHeartbeat(config, "paused"));
      print({ status: "paused", nodeId: config.nodeId });
    } catch (error) {
      // The local credential stays on disk, so a later explicit serve command
      // can recover availability if the network disappeared during shutdown.
      console.error(`CreativesOS: could not mark the local node paused: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

async function runOneNodeJob() {
  let config = await loadNodeConfig();
  // A one-shot run arms this machine only for the duration of its explicit
  // command. This avoids leaving a closed laptop falsely eligible for work.
  ({ config } = await sendNodeHeartbeat(config, "ready"));
  try {
    return await executeOneLocalJob(config);
  } finally {
    try { await sendNodeHeartbeat(config, "paused"); }
    catch (error) { console.error(`CreativesOS: could not mark the local node paused: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
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
    const result = await sendNodeHeartbeat(config, status);
    print({ status: result.node.status, nodeId: result.node.id, sequence: result.config.sequence, lastSeenAt: result.node.lastSeenAt });
    return;
  }
  if (subcommand === "work") {
    const result = await runOneNodeJob();
    print(result);
    return;
  }
  if (subcommand === "serve") {
    await runNodeService();
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
if (command === "node") await runNodeCommand();
else {
  const routes = { profile: "/profile", assets: "/assets", products: "/products", analytics: "/analytics/summary" };
  if (command === "openapi") print(await request("/openapi.json", false));
  else if (command === "doctor") {
    const document = await request("/openapi.json", false);
    print({ status: "ok", api: baseUrl, openapi: document?.openapi ?? "unknown", credential: apiKey ? "present (not validated)" : "not configured" });
  } else if (routes[command]) print(await request(routes[command]));
  else usage(2);
}
