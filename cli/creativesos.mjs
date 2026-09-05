#!/usr/bin/env node
// CreativesOS CLI is intentionally a thin client over the versioned public
// API. It never opens a shell, handles Docker, or stores credentials by
// default; those capabilities belong to the separately paired local node.
const version = "0.1.0";
const args = process.argv.slice(2);
const command = args.includes("--version") || args.includes("-v") ? "version" : args.find((value) => !value.startsWith("-")) ?? "help";
const json = args.includes("--json");
const baseUrl = (process.env.CREATIVESOS_API_URL ?? "https://creativesos.net/api/v1").replace(/\/$/, "");
const apiKey = process.env.CREATIVESOS_API_KEY?.trim();

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

Environment:
  CREATIVESOS_API_URL   Versioned API base (default: https://creativesos.net/api/v1)
  CREATIVESOS_API_KEY   Scoped API key; required except for openapi

The CLI does not persist credentials and does not execute local code. A future
paired local-node command will require explicit device approval.`);
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

const routes = { profile: "/profile", assets: "/assets", products: "/products", analytics: "/analytics/summary" };
if (command === "openapi") print(await request("/openapi.json", false));
else if (command === "doctor") {
  const document = await request("/openapi.json", false);
  print({ status: "ok", api: baseUrl, openapi: document?.openapi ?? "unknown", credential: apiKey ? "present (not validated)" : "not configured" });
} else if (routes[command]) print(await request(routes[command]));
else usage(2);
