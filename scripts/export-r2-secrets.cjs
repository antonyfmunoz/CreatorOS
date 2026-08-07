#!/usr/bin/env node
// Produces a Fly-compatible NAME=VALUE stream from environment variables.
// Values are deliberately written only to stdout for a direct secret-import
// pipe; this helper never logs them or writes them to disk.
const keys = [
  "ASSET_STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
];
const missing = keys.filter((key) => !process.env[key]);
if (missing.length) {
  process.stderr.write(`Missing required R2 values: ${missing.join(", ")}\n`);
  process.exit(2);
}
process.stdout.write(keys.map((key) => `${key}=${process.env[key]}`).join("\n"));
