import type { CutSourceFile } from "./cut-code-authoring";

// Registry metadata copied from the exact qualified cut-code package-lock.json.
// This is a closed data graph, not a package resolver or an installer. A test
// compares every record against that runtime lock so upgrades cannot drift.
export const cutPinnedPackageRecords = {
  react: { version: "18.3.1", resolved: "https://registry.npmjs.org/react/-/react-18.3.1.tgz", integrity: "sha512-wS+hAgJShR0KhEvPJArfuPVN1+Hz1t0Y6n5jLrGQbkb4urgPE/0Rve+1kMB1v/oWgHgm4WIcV+i7F2pTVj+2iQ==", license: "MIT", dependencies: { "loose-envify": "^1.1.0" }, engines: { node: ">=0.10.0" } },
  "react-dom": { version: "18.3.1", resolved: "https://registry.npmjs.org/react-dom/-/react-dom-18.3.1.tgz", integrity: "sha512-5m4nQKp+rZRb09LNH59GM4BxTh9251/ylbKIbpe7TpGxfJ+9kv6BLkLBXIjjspbgbnIBNqlI23tRnTWT0snUIw==", license: "MIT", dependencies: { "loose-envify": "^1.1.0", scheduler: "^0.23.2" }, peerDependencies: { react: "^18.3.1" } },
  three: { version: "0.185.1", resolved: "https://registry.npmjs.org/three/-/three-0.185.1.tgz", integrity: "sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==", license: "MIT" },
  "loose-envify": { version: "1.4.0", resolved: "https://registry.npmjs.org/loose-envify/-/loose-envify-1.4.0.tgz", integrity: "sha512-lyuxPGr/Wfhrlem2CL/UcnUc1zcqKAImBDzukY7Y5F/yQiNdko6+fRLevlw1HgMySw7f611UIY408EtxRSoK3Q==", license: "MIT", dependencies: { "js-tokens": "^3.0.0 || ^4.0.0" }, bin: { "loose-envify": "cli.js" } },
  "js-tokens": { version: "4.0.0", resolved: "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz", integrity: "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==", license: "MIT" },
  scheduler: { version: "0.23.2", resolved: "https://registry.npmjs.org/scheduler/-/scheduler-0.23.2.tgz", integrity: "sha512-UOShsPwz7NrMUqhR6t0hWjFduvOzbtv7toDH1/hIrfRNIDBnnBWd0CwJTGvTpngVlmwGCdP9/Zl/tVrDqcuYzQ==", license: "MIT", dependencies: { "loose-envify": "^1.1.0" } },
} as const;
type PackageName = keyof typeof cutPinnedPackageRecords;
const pins = { react: "18.3.1", "react-dom": "18.3.1", three: "0.185.1" } as const;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function generateCutSourceLockfile(files: CutSourceFile[]) {
  if (files.some((file) => ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"].includes(file.path))) throw new Error("This source already includes a lockfile. Supply that matching lockfile separately; automatic generation will not replace it.");
  const source = files.find((file) => file.path === "package.json");
  if (!source) throw new Error("Include package.json before generating a lockfile.");
  let manifest: unknown;
  try { manifest = JSON.parse(source.content.replace(/^\uFEFF/, "")); } catch { throw new Error("package.json must be valid JSON before generating a lockfile."); }
  if (!object(manifest)) throw new Error("package.json must contain an object.");
  // Do not silently omit another dependency class, workspace, override, or
  // install hook and then describe the result as a matching dependency graph.
  for (const key of ["devDependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "overrides", "resolutions", "workspaces", "bundledDependencies", "bundleDependencies"]) {
    if (Object.hasOwn(manifest, key)) throw new Error(`Automatic lockfiles do not support ${key}. Keep using a separately supplied matching lockfile.`);
  }
  if (manifest.scripts !== undefined && (!object(manifest.scripts) || ["preinstall", "install", "postinstall", "prepare"].some((key) => Object.hasOwn(manifest.scripts as object, key)))) throw new Error("Automatic lockfiles do not support installation hooks.");
  const dependencies = manifest.dependencies === undefined ? {} : manifest.dependencies;
  if (!object(dependencies)) throw new Error("dependencies must be an object of exact pinned versions.");
  for (const [name, version] of Object.entries(dependencies)) {
    if (!Object.hasOwn(pins, name) || version !== pins[name as keyof typeof pins]) throw new Error("Automatic lockfiles support only React 18.3.1, React DOM 18.3.1 and Three 0.185.1 at exact versions.");
  }
  if (dependencies["react-dom"] && dependencies.react !== pins.react) throw new Error("Declare React 18.3.1 alongside React DOM so its peer dependency is explicit.");
  const root: Record<string, unknown> = {};
  for (const key of ["name", "version"] as const) {
    if (manifest[key] !== undefined) {
      if (typeof manifest[key] !== "string" || manifest[key].length > 214) throw new Error(`${key} must be a bounded string.`);
      root[key] = manifest[key];
    }
  }
  root.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const needed = new Set<PackageName>();
  const visit = (name: PackageName) => {
    if (needed.has(name)) return;
    needed.add(name);
    const record = cutPinnedPackageRecords[name];
    if ("dependencies" in record) for (const dependency of Object.keys(record.dependencies)) visit(dependency as PackageName);
  };
  for (const name of Object.keys(dependencies)) visit(name as PackageName);
  const packages: Record<string, unknown> = { "": root };
  for (const name of Array.from(needed).sort()) packages[`node_modules/${name}`] = cutPinnedPackageRecords[name];
  return JSON.stringify({ ...(root.name ? { name: root.name } : {}), ...(root.version ? { version: root.version } : {}), lockfileVersion: 3, requires: true, packages }, null, 2) + "\n";
}
