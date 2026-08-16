#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=normal", "-z"],
  { cwd: process.cwd(), encoding: "utf8" },
);

if (result.error || result.status !== 0) {
  throw result.error ?? new Error("Unable to inspect the release source worktree");
}

const entries = result.stdout.split("\0").filter(Boolean);
if (entries.length > 0) {
  const displayEntries = entries.map((entry) => entry.replaceAll("\r", "\\r").replaceAll("\n", "\\n"));
  process.stderr.write(`Production releases require a clean source worktree:\n${displayEntries.join("\n")}\n`);
  process.exitCode = 1;
}
