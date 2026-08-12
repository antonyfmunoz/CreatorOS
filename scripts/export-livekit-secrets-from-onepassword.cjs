#!/usr/bin/env node
// Reads the LiveKit values directly from 1Password and emits a Fly-compatible
// NAME=VALUE stream. Values never reach a file or log.
const { execFileSync } = require("child_process");

const vault = "CreativesOS";
const item = "Development";
const keys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];

try {
  const lines = keys.map((key) => {
    const value = execFileSync("op", ["read", `op://${vault}/${item}/${key}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!value) throw new Error(`${key} is empty`);
    if (key === "LIVEKIT_URL" && !value.startsWith("wss://")) {
      throw new Error("LIVEKIT_URL must start with wss://");
    }
    return `${key}=${value}`;
  });
  process.stdout.write(lines.join("\n"));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to read LiveKit secrets from 1Password"}\n`);
  process.exit(1);
}
