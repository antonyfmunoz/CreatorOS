#!/usr/bin/env node
// Diagnostic companion for export-r2-secrets. It reports only field names,
// lengths, and value hashes so a secret stream can be validated safely.
const crypto = require("crypto");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const lines = input.split(/\r?\n/).filter(Boolean);
  const report = lines.map((line) => {
    const separator = line.indexOf("=");
    const name = separator === -1 ? "<invalid>" : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1);
    return { name, length: value.length, digest: crypto.createHash("sha256").update(value).digest("hex").slice(0, 12) };
  });
  process.stdout.write(JSON.stringify(report));
});
