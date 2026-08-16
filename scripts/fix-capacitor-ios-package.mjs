import { readFileSync, writeFileSync } from "node:fs";

const path = "ios/App/CapApp-SPM/Package.swift";
const source = readFileSync(path, "utf8");
const normalized = source
  .split(/\r?\n/)
  .map((line) => (line.includes(".package(") && line.includes("path:") ? line.replaceAll("\\", "/") : line))
  .join("\n");
if (normalized !== source) writeFileSync(path, normalized);
if (/path: "[^"]*\\/.test(normalized)) {
  throw new Error("Capacitor generated a non-portable Swift package path");
}
console.log("Capacitor iOS package paths are portable.");
