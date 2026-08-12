#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.startsWith("attached_assets/") && !file.endsWith("package-lock.json"));

const patterns = [
  { name: "private key", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Stripe live secret", expression: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: "Stripe webhook secret", expression: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { name: "Clerk secret", expression: /\bsk_(?:test|live)_[A-Za-z0-9_-]{20,}\b/ },
  { name: "generic bearer credential", expression: /Authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{24,}/i },
];

const findings = [];
for (const file of tracked) {
  let body;
  try {
    body = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.expression.test(body)) findings.push(`${file}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error("Potential committed credentials detected:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ status: "clean", scannedFiles: tracked.length }));
