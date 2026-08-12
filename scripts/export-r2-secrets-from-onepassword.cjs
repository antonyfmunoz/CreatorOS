#!/usr/bin/env node
// Reads the six R2 values directly from 1Password by reference and emits a
// Fly-compatible NAME=VALUE stream. Values never reach a file or log.
const { execFileSync } = require("child_process");

const vault = "CreativesOS";
const item = "Development";
const keys = [
  "ASSET_STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
  "R2_PRIVATE_BUCKET_NAME",
];

try {
  const lines = keys.map((key) => {
    const value = execFileSync("op", ["read", `op://${vault}/${item}/${key}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!value) throw new Error(`${key} is empty`);
    return `${key}=${value}`;
  });
  process.stdout.write(lines.join("\n"));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to read R2 secrets from 1Password"}\n`);
  process.exit(1);
}
