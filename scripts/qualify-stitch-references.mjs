#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = join(repositoryRoot, "attached_assets", "stitch_creatoros", "stitch_creatoros");
const parityPath = join(repositoryRoot, "docs", "qualification", "STITCH_SCREEN_PARITY.md");
const manifestPath = join(repositoryRoot, "docs", "qualification", "stitch-reference-manifest.json");
const update = process.argv.includes("--update");

if (!existsSync(referenceRoot)) throw new Error(`Authoritative Stitch root is missing: ${referenceRoot}`);
const parity = readFileSync(parityPath, "utf8");
const folders = readdirSync(referenceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (folders.length !== 74) throw new Error(`Expected 74 authoritative Stitch folders, found ${folders.length}`);
const entries = [];
for (const folder of folders) {
  if (!/^[a-z0-9_]+$/.test(folder)) throw new Error(`Unsafe Stitch folder name: ${folder}`);
  const screenPath = join(referenceRoot, folder, "screen.png");
  if (!existsSync(screenPath)) throw new Error(`Stitch screen reference is missing: ${folder}`);
  const resolvedScreen = resolve(screenPath);
  if (!resolvedScreen.startsWith(`${resolve(referenceRoot)}${sep}`)) throw new Error(`Reference escaped authoritative root: ${folder}`);
  const image = readFileSync(screenPath);
  const metadata = await sharp(image, { failOn: "error" }).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error(`Unreadable Stitch PNG: ${folder}`);
  const references = parity.split(`\`${folder}\``).length - 1;
  if (references !== 1) throw new Error(`Parity register must name ${folder} exactly once; found ${references}`);
  entries.push({
    folder,
    screen: relative(repositoryRoot, screenPath).replaceAll("\\", "/"),
    width: metadata.width,
    height: metadata.height,
    sha256: createHash("sha256").update(image).digest("hex"),
  });
}

const manifest = {
  schemaVersion: "creativesos.stitch-reference-manifest.v1",
  policy: "Only attached_assets/stitch_creatoros/stitch_creatoros/*/screen.png may be used as design-reference imagery.",
  count: entries.length,
  entries,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (update) writeFileSync(manifestPath, serialized, "utf8");
if (!existsSync(manifestPath)) throw new Error(`Reference manifest is missing. Run: node scripts/qualify-stitch-references.mjs --update`);
if (readFileSync(manifestPath, "utf8").replaceAll("\r\n", "\n") !== serialized) {
  throw new Error("Stitch references changed without an explicit manifest update and parity review");
}
console.log(JSON.stringify({ status: "qualified", referenceCount: entries.length, root: relative(repositoryRoot, referenceRoot).replaceAll("\\", "/") }));
