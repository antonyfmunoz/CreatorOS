#!/usr/bin/env node
// Reports only non-reversible diagnostics for one secret value on stdin.
const crypto = require("crypto");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const value = input.trim();
  process.stdout.write(JSON.stringify({
    length: value.length,
    digest: crypto.createHash("sha256").update(value).digest("hex").slice(0, 12),
  }));
});
