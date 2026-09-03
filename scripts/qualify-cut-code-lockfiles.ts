import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateCutSourceLockfile } from "../shared/cut-code-lockfile";
import { validateCutSourceLockfilePair } from "../server/cut-code-lockfile";

// Only these owned synthetic manifests are installed. This script never accepts
// user source, executes lifecycle scripts, or touches workspace node_modules.
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && path.isAbsolute(npmCli) && /npm-cli\.js$/i.test(npmCli), "Run through npm exec so its installed CLI path is explicit.");
const directory = await mkdtemp(path.join(os.tmpdir(), "creativesos-cut-lockfiles-"));
const receipt: { passed: boolean; cases: Array<{ name: string; lockSha256: string; versions: Record<string, string> }> } = { passed: false, cases: [] };
console.log(`Owned lockfile qualification: ${directory}`);
const userConfig = path.join(directory, "user.npmrc"), globalConfig = path.join(directory, "global.npmrc");
await writeFile(userConfig, ""); await writeFile(globalConfig, "");
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|LOCALAPPDATA|APPDATA|USERPROFILE|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA)$/i.test(key))) as Record<string, string>;
const cases = [
  { name: "starter", dependencies: { react: "18.3.1" } },
  { name: "full", dependencies: { react: "18.3.1", "react-dom": "18.3.1", three: "0.185.1" } },
  { name: "three-only", dependencies: { three: "0.185.1" } },
  { name: "empty", dependencies: {} },
];
try {
  for (const item of cases) {
    const location = path.join(directory, item.name); await mkdir(location);
    const manifest = JSON.stringify({ name: `qualification-${item.name}`, private: true, dependencies: item.dependencies }, null, 2);
    const lock = generateCutSourceLockfile([{ path: "package.json", content: manifest }]);
    assert.equal(validateCutSourceLockfilePair(manifest, "package-lock.json", lock).graph, "pinned_graph_matched");
    await writeFile(path.join(location, "package.json"), manifest); await writeFile(path.join(location, "package-lock.json"), lock);
    execFileSync(process.execPath, [npmCli!, "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", `--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`, `--cache=${path.join(directory, "cache")}`], { cwd: location, env, timeout: 120_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(await readFile(path.join(location, "package-lock.json"), "utf8"), lock);
    assert.equal(await readFile(path.join(location, "package.json"), "utf8"), manifest);
    const versions: Record<string, string> = {};
    for (const [relative, record] of Object.entries(JSON.parse(lock).packages) as Array<[string, { version?: string }]>) {
      if (!relative) continue;
      const installed = JSON.parse(await readFile(path.join(location, relative, "package.json"), "utf8"));
      assert.equal(installed.version, record.version); versions[relative] = installed.version;
    }
    receipt.cases.push({ name: item.name, lockSha256: createHash("sha256").update(lock).digest("hex"), versions });
    console.log(`PASS ${item.name}: frozen lockfile installed exact versions with lifecycle scripts disabled.`);
  }
  receipt.passed = true;
} finally {
  // Retain only owned synthetic packages and the receipt for inspection. No
  // credentials, app source, or user assets are copied into this directory.
  await writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2));
}
