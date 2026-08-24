import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requiredBenchmarkEvidenceKinds } from "../shared/competitive-benchmarks";

type EvidenceKind = (typeof requiredBenchmarkEvidenceKinds)[number];

export type CompetitiveEvidenceInput = Record<EvidenceKind, string>;

export type CompetitiveEvidenceRecord = {
  kind: EvidenceKind;
  uri: string;
  checksum: string;
  bytes: number;
  filename: string;
};

const safeRunId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/;

async function sha256File(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function safeFilename(value: string): string {
  return basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160);
}

export async function buildCompetitiveEvidencePackage(input: {
  runId: string;
  outputRoot: string;
  files: CompetitiveEvidenceInput;
}) {
  if (!safeRunId.test(input.runId)) {
    throw new Error(
      "Run ID must be 3-80 characters using letters, numbers, underscores, or hyphens",
    );
  }
  const outputRoot = resolve(input.outputRoot);
  await mkdir(outputRoot, { recursive: true });
  const destination = join(outputRoot, input.runId);
  try {
    await stat(destination);
    throw new Error(`Evidence package already exists for ${input.runId}`);
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes("ENOENT") &&
      !error.message.includes("cannot find")
    ) {
      throw error;
    }
  }

  const staging = await mkdtemp(join(outputRoot, `.staging-${input.runId}-`));
  try {
    const evidence: CompetitiveEvidenceRecord[] = [];
    for (const kind of requiredBenchmarkEvidenceKinds) {
      const source = resolve(input.files[kind]);
      const sourceStat = await stat(source);
      if (!sourceStat.isFile() || sourceStat.size <= 0) {
        throw new Error(`${kind} must reference a non-empty file`);
      }
      const filename = `${kind}-${safeFilename(source)}`;
      const copied = join(staging, filename);
      await copyFile(source, copied);
      evidence.push({
        kind,
        uri: `artifact://competitive/${encodeURIComponent(input.runId)}/${encodeURIComponent(filename)}`,
        checksum: `sha256:${await sha256File(copied)}`,
        bytes: sourceStat.size,
        filename,
      });
    }

    const manifest = {
      schema: "creativesos.competitive-evidence.v1",
      runId: input.runId,
      createdAt: new Date().toISOString(),
      evidence,
    };
    const manifestPath = join(staging, "evidence.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(staging, destination);
    return {
      directory: destination,
      manifestPath: join(destination, "evidence.json"),
      evidence,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function main() {
  const result = await buildCompetitiveEvidencePackage({
    runId: argument("run-id"),
    outputRoot: argument("output-root"),
    files: {
      input_manifest: argument("input-manifest"),
      action_log: argument("action-log"),
      output_artifact: argument("output-artifact"),
      run_recording: argument("run-recording"),
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1]
  ? resolve(process.argv[1])
  : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Evidence packaging failed"}\n`,
    );
    process.exitCode = 1;
  });
}
