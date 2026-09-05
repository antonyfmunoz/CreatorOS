#!/usr/bin/env node
// Minimal stdio MCP server. It is deliberately read-only until individual
// mutation tools have their own scopes, approval semantics and audit receipts.
const apiUrl = (process.env.CREATIVESOS_API_URL ?? "https://creativesos.net/api/v1").replace(/\/$/, "");
const apiKey = process.env.CREATIVESOS_API_KEY?.trim();
const tools = [
  ["creativesos_profile", "Read the profile for the API key's scoped business.", "/profile"],
  ["creativesos_assets", "List assets for the API key's scoped business.", "/assets"],
  ["creativesos_products", "List products for the API key's scoped business.", "/products"],
  ["creativesos_analytics_summary", "Read the analytics summary for the API key's scoped business.", "/analytics/summary"],
  ["creativesos_cut_local_nodes", "Read paired CutStudio local-node status for the API key's scoped business. This cannot pair, execute, or revoke a node.", "/cut/local-nodes"],
  ["creativesos_openapi", "Read the current public CreativesOS OpenAPI document.", "/openapi.json", false],
];

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function error(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }
async function read(path, requiresKey = true) {
  if (requiresKey && !apiKey) throw new Error("CREATIVESOS_API_KEY is required. Create a minimally scoped API key in CreativesOS Developer settings.");
  const response = await fetch(`${apiUrl}${path}`, { headers: { Accept: "application/json", ...(requiresKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, signal: AbortSignal.timeout(12_000) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error?.message ?? `CreativesOS API returned ${response.status}.`);
  return value;
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
  const id = message.id;
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: { protocolVersion: message.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "creativesos", version: "0.1.0" } } });
  }
  if (message.method === "tools/list") {
    return send({ jsonrpc: "2.0", id, result: { tools: tools.map(([name, description]) => ({ name, description, inputSchema: { type: "object", properties: {}, additionalProperties: false } })) } });
  }
  if (message.method !== "tools/call") return error(id, -32601, "Method not found");
  const tool = tools.find(([name]) => name === message.params?.name);
  if (!tool) return error(id, -32602, "Unknown CreativesOS tool");
  try {
    const value = await read(tool[2], tool[3] !== false);
    return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] } });
  } catch (cause) {
    return send({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: cause instanceof Error ? cause.message : "CreativesOS request failed." }] } });
  }
}

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  for (;;) {
    const index = pending.indexOf("\n");
    if (index < 0) break;
    const line = pending.slice(0, index).trim(); pending = pending.slice(index + 1);
    if (!line) continue;
    try { void handle(JSON.parse(line)); } catch { error(null, -32700, "Parse error"); }
  }
});
