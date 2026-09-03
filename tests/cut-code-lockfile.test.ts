import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cutPinnedPackageRecords, generateCutSourceLockfile } from "../shared/cut-code-lockfile";
import { starterCutSource } from "../shared/cut-code-authoring";
import { validateCutSourceLockfilePair } from "../server/cut-code-lockfile";

const files = (manifest: unknown) => [{ path: "package.json", content: JSON.stringify(manifest) }];
describe("CutStudio closed dependency lockfile generation", () => {
  it("uses the exact qualified runtime metadata, including all integrity hashes", () => {
    const runtime = JSON.parse(readFileSync(new URL("../runtimes/cut-code/package-lock.json", import.meta.url), "utf8"));
    for (const [name, record] of Object.entries(cutPinnedPackageRecords)) expect(record).toEqual(runtime.packages[`node_modules/${name}`]);
  });
  it("generates only the complete starter dependency closure without changing source", () => {
    const source = starterCutSource(); const before = structuredClone(source);
    const lock = JSON.parse(generateCutSourceLockfile(source));
    expect(source).toEqual(before); expect(lock.lockfileVersion).toBe(3);
    expect(lock.packages[""].dependencies).toEqual({ react: "18.3.1" });
    expect(Object.keys(lock.packages)).toEqual(["", "node_modules/js-tokens", "node_modules/loose-envify", "node_modules/react"]);
  });
  it("includes exact transitive and peer dependencies for the full pinned set deterministically", () => {
    const a = generateCutSourceLockfile(files({ dependencies: { three: "0.185.1", "react-dom": "18.3.1", react: "18.3.1" } }));
    const b = generateCutSourceLockfile(files({ dependencies: { react: "18.3.1", "react-dom": "18.3.1", three: "0.185.1" } }));
    expect(a).toBe(b); expect(Object.keys(JSON.parse(a).packages)).toHaveLength(7);
  });
  it("keeps empty and Three-only graphs minimal and preserves source identity", () => {
    expect(Object.keys(JSON.parse(generateCutSourceLockfile(files({ name: "test", version: "1.2.3" }))).packages)).toEqual([""]);
    const lock = JSON.parse(generateCutSourceLockfile(files({ dependencies: { three: "0.185.1" } })));
    expect(Object.keys(lock.packages)).toEqual(["", "node_modules/three"]);
  });
  it.each(["^18.3.1", "latest", "file:../react", "https://example.com/package.tgz", null])("rejects unpinned or redirected dependency %s", (version) => {
    expect(() => generateCutSourceLockfile(files({ dependencies: { react: version } }))).toThrow(/exact versions/);
  });
  it.each(["devDependencies", "optionalDependencies", "peerDependencies", "overrides", "workspaces", "bundledDependencies"])("never silently drops %s", (key) => {
    expect(() => generateCutSourceLockfile(files({ [key]: {} }))).toThrow(key);
  });
  it("does not execute source/scripts and rejects implicit peers or install hooks", () => {
    expect(() => generateCutSourceLockfile(files({ dependencies: { "react-dom": "18.3.1" } }))).toThrow(/peer/);
    expect(() => generateCutSourceLockfile(files({ scripts: { install: "throw new Error('never run')" } }))).toThrow(/hooks/);
    expect(() => generateCutSourceLockfile(files({ dependencies: { unknown: "1.0.0" } }))).toThrow(/exact/);
    expect(() => generateCutSourceLockfile(files({ dependencies: [] }))).toThrow(/object/);
    expect(() => generateCutSourceLockfile(files({ name: [] }))).toThrow(/string/);
    expect(() => generateCutSourceLockfile([{ path: "package.json", content: "{" }])).toThrow(/JSON/);
    expect(() => generateCutSourceLockfile(files({ dependencies: null }))).toThrow(/object/);
    expect(() => generateCutSourceLockfile([...starterCutSource(), { path: "package-lock.json", content: "{}" }])).toThrow(/already includes/);
  });
  it("reconciles the full pinned source graph on the server, not just its filename", () => {
    const source = starterCutSource(); const manifest = source.find(file => file.path === "package.json")!.content;
    const text = generateCutSourceLockfile(source);
    expect(validateCutSourceLockfilePair(manifest, "package-lock.json", text).graph).toBe("pinned_graph_matched");
    for (const mutate of [
      (lock: any) => { lock.packages[""].dependencies.react = "18.2.0"; },
      (lock: any) => { lock.packages["node_modules/react"].version = "18.2.0"; },
      (lock: any) => { lock.packages["node_modules/react"].integrity = "tampered"; },
      (lock: any) => { lock.packages["node_modules/react"].resolved = "https://example.com/react.tgz"; },
      (lock: any) => { lock.packages["node_modules/react"].hasInstallScript = true; },
      (lock: any) => { delete lock.packages["node_modules/js-tokens"]; },
      (lock: any) => { lock.packages["node_modules/unexpected"] = { version: "1.0.0" }; },
    ]) {
      const lock = JSON.parse(text); mutate(lock);
      expect(() => validateCutSourceLockfilePair(manifest, "package-lock.json", JSON.stringify(lock))).toThrow(/match/);
    }
  });
  it("does not label legacy formats or unqualified dependency graphs as pinned proof", () => {
    expect(validateCutSourceLockfilePair("{}", "yarn.lock", "# yarn lockfile v1").graph).toBe("unverified");
    expect(validateCutSourceLockfilePair("{}", "package-lock.json", '{"lockfileVersion":1}').graph).toBe("unverified");
    const manifest = { dependencies: { other: "^1.0.0" } };
    expect(validateCutSourceLockfilePair(JSON.stringify(manifest), "package-lock.json", JSON.stringify({ lockfileVersion: 3, packages: { "": manifest } })).graph).toBe("declarations_matched");
    expect(() => validateCutSourceLockfilePair(JSON.stringify(manifest), "package-lock.json", '{"lockfileVersion":3,"packages":{}}')).toThrow(/root/);
  });
});
