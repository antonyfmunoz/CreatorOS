#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = path.resolve("dist/public");
const htmlPath = path.join(root, "index.html");
if (!fs.existsSync(htmlPath)) throw new Error("Build output is missing; run npm run build first");

const html = fs.readFileSync(htmlPath, "utf8");
const initialUrls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
const initialFiles = [...new Set(initialUrls)].map((url) => path.join(root, url.replace(/^\//, "")));
const gzipBytes = (file) => gzipSync(fs.readFileSync(file), { level: 9 }).byteLength;
const initialGzipBytes = initialFiles.reduce((sum, file) => sum + gzipBytes(file), 0);
const assetFiles = fs.readdirSync(path.join(root, "assets")).map((name) => path.join(root, "assets", name));
const largestDeferredJsGzipBytes = Math.max(...assetFiles.filter((file) => file.endsWith(".js") && !initialFiles.includes(file)).map(gzipBytes));
const riveWasmPath = path.resolve("node_modules/@rive-app/canvas-lite/rive.wasm");
if (!fs.existsSync(riveWasmPath)) throw new Error("Pinned Rive WASM runtime is missing");
const riveWasmBytes = fs.statSync(riveWasmPath).size;
const riveWasmGzipBytes = gzipBytes(riveWasmPath);

const budgets = {
  initialGzipBytes: 225 * 1024,
  largestDeferredJsGzipBytes: 150 * 1024,
  riveWasmBytes: 800 * 1024,
  riveWasmGzipBytes: 350 * 1024,
};
const result = {
  schemaVersion: "creativesos.bundle-budget.v1",
  initialAssetCount: initialFiles.length,
  initialGzipBytes,
  largestDeferredJsGzipBytes,
  riveWasmBytes,
  riveWasmGzipBytes,
  budgets,
};
console.log(JSON.stringify(result));
if (initialGzipBytes > budgets.initialGzipBytes) throw new Error("Initial application bundle exceeded the gzip budget");
if (largestDeferredJsGzipBytes > budgets.largestDeferredJsGzipBytes) throw new Error("A deferred route bundle exceeded the gzip budget");
if (riveWasmBytes > budgets.riveWasmBytes || riveWasmGzipBytes > budgets.riveWasmGzipBytes) throw new Error("The Rive WASM runtime exceeded its release budget");
