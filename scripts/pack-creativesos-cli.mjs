import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(repositoryRoot, "release", "cli-package");
const runtimeSource = path.join(repositoryRoot, "runtimes", "cut-code");
const runtimeTarget = path.join(releaseRoot, "runtimes", "cut-code");
const packageSource = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));

// This is intentionally an independent, minimal distribution package. The web
// application root is private and must never be published as the CLI.
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(path.join(releaseRoot, "cli"), { recursive: true });
await mkdir(path.join(releaseRoot, "mcp"), { recursive: true });

await cp(path.join(repositoryRoot, "cli", "creativesos.mjs"), path.join(releaseRoot, "cli", "creativesos.mjs"));
await cp(path.join(repositoryRoot, "mcp", "creativesos-mcp.mjs"), path.join(releaseRoot, "mcp", "creativesos-mcp.mjs"));
await cp(runtimeSource, runtimeTarget, {
  recursive: true,
  filter: (source) => {
    const name = path.basename(source);
    return name !== "node_modules" && !name.endsWith(".test.mjs") && !name.startsWith("qualify");
  },
});

const cliPackage = {
  name: "@creativesos/cli",
  version: packageSource.version,
  description: "CreativesOS CLI and local-first CutStudio node runtime.",
  license: packageSource.license,
  type: "module",
  engines: { node: "22.x" },
  bin: { creativesos: "cli/creativesos.mjs", "creativesos-mcp": "mcp/creativesos-mcp.mjs" },
  files: ["cli", "mcp", "runtimes/cut-code", "README.md", "package.json"],
};

await writeFile(path.join(releaseRoot, "package.json"), `${JSON.stringify(cliPackage, null, 2)}\n`, "utf8");
await writeFile(path.join(releaseRoot, "README.md"), `# CreativesOS CLI\n\nThis package provides the user-authorized CreativesOS CLI, its read-only MCP server, and the CutStudio local-node runtime.\n\nInstall from an approved registry release, then run \`creativesos --help\` or \`creativesos-mcp\`. Pairing a device and executing a render are explicit user actions; neither surface stores a general API key or starts a local render automatically. Use \`creativesos node work\` for one bounded job, or explicitly start \`creativesos node serve\` to keep this foreground device available for its owner's approved local queue.\n\nThe bundled runtime is used only as a Docker build context for the isolated, network-disabled CutStudio container. Build or select an approved immutable local runtime image before running a local node.\n`, "utf8");

console.log(`Prepared standalone CLI package at ${releaseRoot}`);
