import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCompetitiveEvidencePackage } from "../scripts/build-competitive-evidence";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("competitive evidence package", () => {
  it("copies all required evidence, hashes it, and never overwrites a run", async () => {
    const root = await mkdtemp(join(tmpdir(), "creativesos-benchmark-"));
    temporaryDirectories.push(root);
    const files = {
      input_manifest: join(root, "input.json"),
      action_log: join(root, "actions.jsonl"),
      output_artifact: join(root, "output.mp4"),
      run_recording: join(root, "recording.webm"),
    };
    await Promise.all([
      writeFile(files.input_manifest, '{"source":"fixture"}\n'),
      writeFile(files.action_log, '{"action":"start"}\n'),
      writeFile(files.output_artifact, Buffer.from([0, 1, 2, 3])),
      writeFile(files.run_recording, Buffer.from([4, 5, 6, 7])),
    ]);

    const first = await buildCompetitiveEvidencePackage({
      runId: "benchmark-run-001",
      outputRoot: join(root, "packages"),
      files,
    });
    expect(first.evidence).toHaveLength(4);
    expect(first.evidence.every((item) => /^sha256:[a-f0-9]{64}$/.test(item.checksum))).toBe(true);
    const manifest = JSON.parse(await readFile(first.manifestPath, "utf8"));
    expect(manifest).toMatchObject({
      schema: "creativesos.competitive-evidence.v1",
      runId: "benchmark-run-001",
    });
    expect(manifest.evidence.map((item: { kind: string }) => item.kind)).toEqual([
      "input_manifest",
      "action_log",
      "output_artifact",
      "run_recording",
    ]);

    await expect(
      buildCompetitiveEvidencePackage({
        runId: "benchmark-run-001",
        outputRoot: join(root, "packages"),
        files,
      }),
    ).rejects.toThrow(/already exists/i);
  });
});
