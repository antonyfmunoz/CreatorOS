import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cutFilterGraphArgs } from "../server/cut-filter-graph";

const directories: string[] = [];
async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "cut-graph-test-"));
  directories.push(directory); return directory;
}
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (!path.isAbsolute(directory) || !path.basename(directory).startsWith("cut-graph-test-")) throw new Error("Unexpected owned test directory");
    await rm(directory, { recursive: true, force: true });
  }
});
it("stores generated UTF-8 filters as private data using the supported file option", async () => {
  const directory = await temporaryDirectory();
  const [option, file] = await cutFilterGraphArgs(directory, ["[0:v]format=rgba[source]", "[source]null[result]"]);
  expect(option).toBe("-/filter_complex"); expect(path.dirname(file)).toBe(directory);
  expect(await readFile(file, "utf8")).toBe("[0:v]format=rgba[source];[source]null[result]");
  if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
});
it("does not overwrite another graph in the same job directory", async () => {
  const directory = await temporaryDirectory();
  const first = await cutFilterGraphArgs(directory, ["[0:v]null[one]"]);
  const second = await cutFilterGraphArgs(directory, ["[0:v]null[two]"]);
  expect(first[1]).not.toBe(second[1]);
  expect(await readFile(first[1], "utf8")).toContain("[one]");
});
it("rejects empty and oversized generated data before creating a file", async () => {
  const directory = await temporaryDirectory();
  await expect(cutFilterGraphArgs(directory, [])).rejects.toThrow(/empty/);
  await expect(cutFilterGraphArgs(directory, ["é".repeat(4 * 1024 * 1024 + 1)])).rejects.toThrow(/8 MiB/);
  expect(await readdir(directory)).toEqual([]);
});
