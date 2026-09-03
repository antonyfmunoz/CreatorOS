import { isDeepStrictEqual } from "node:util";
import { generateCutSourceLockfile } from "../shared/cut-code-lockfile";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function json(source: string, label: string) {
  let value: unknown;
  try { value = JSON.parse(source.replace(/^\uFEFF/, "")); } catch { throw new Error(`${label} must contain valid JSON.`); }
  if (!object(value)) throw new Error(`${label} must contain an object.`);
  return value;
}

// Reconcile declarations without resolving/installing anything. For the closed
// supported npm graph, also check every exact package record and integrity hash.
// Legacy npm v1/Yarn/pnpm remain format-validated imports, not executable proof.
export function validateCutSourceLockfilePair(manifestText: string, filename: string, lockfileText: string) {
  const manifest = json(manifestText, "package.json");
  if (!["package-lock.json", "npm-shrinkwrap.json"].includes(filename.toLowerCase())) return { graph: "unverified" as const };
  const lock = json(lockfileText, "Dependency lockfile");
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) return { graph: "unverified" as const };
  if (!object(lock.packages) || !object(lock.packages[""])) throw new Error("The npm lockfile must include its root package declaration.");
  const root = lock.packages[""];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const) {
    const declared = manifest[field] === undefined ? {} : manifest[field];
    const locked = root[field] === undefined ? {} : root[field];
    if (!object(declared) || !object(locked) || Object.values(declared).some((value) => typeof value !== "string") || !isDeepStrictEqual(declared, locked)) throw new Error(`Source and npm lockfile ${field} do not match. Select or generate the matching lockfile.`);
  }
  let expected: ReturnType<typeof json>;
  try { expected = json(generateCutSourceLockfile([{ path: "package.json", content: manifestText }]), "Generated lockfile"); }
  catch { return { graph: "declarations_matched" as const }; }
  const actualPackages = lock.packages;
  const expectedPackages = expected.packages as Record<string, Record<string, unknown>>;
  if (!isDeepStrictEqual(Object.keys(actualPackages).sort(), Object.keys(expectedPackages).sort())) throw new Error("The npm lockfile package graph does not match the pinned source dependencies.");
  for (const [name, record] of Object.entries(expectedPackages)) {
    if (!name) continue;
    const actual = actualPackages[name];
    if (!object(actual)) throw new Error("The npm lockfile has an invalid package record.");
    // npm may add harmless bookkeeping fields such as peer/dev flags. Identity,
    // dependency edges and installer-affecting fields must match the pinned set.
    for (const key of ["version", "resolved", "integrity", "dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "hasInstallScript", "link", "os", "cpu"]) {
      if (!isDeepStrictEqual(actual[key], record[key])) throw new Error("The npm lockfile package versions, integrity or dependency edges do not match the pinned runtime.");
    }
  }
  return { graph: "pinned_graph_matched" as const };
}
