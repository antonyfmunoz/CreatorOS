#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const listed = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { cwd: root },
).toString("utf8");
const files = listed.split("\0").filter(Boolean).sort((left, right) => left.localeCompare(right));

if (!files.length) throw new Error("No release source files were found");

const digest = createHash("sha256");
for (const relative of files) {
  const normalized = relative.replaceAll("\\", "/");
  const absolute = path.resolve(root, relative);
  const relativeCheck = path.relative(root, absolute);
  if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
    throw new Error(`Refusing to fingerprint a path outside the repository: ${relative}`);
  }
  const stat = lstatSync(absolute);
  const content = stat.isSymbolicLink()
    ? Buffer.from(`symlink:${readlinkSync(absolute)}`, "utf8")
    : readFileSync(absolute);
  digest.update(Buffer.from(`${Buffer.byteLength(normalized)}:${normalized}:${content.length}:`, "utf8"));
  digest.update(content);
}

process.stdout.write(`${digest.digest("hex")}\n`);
