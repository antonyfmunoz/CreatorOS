import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cutFilterGraphArgs, selectCutFilterFileOption } from "../server/cut-filter-graph";
const modernOption = async () => "-/filter_complex" as const;

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
  const [option, file] = await cutFilterGraphArgs(directory, ["[0:v]format=rgba[source]", "[source]null[result]"], modernOption);
  expect(option).toBe("-/filter_complex"); expect(path.dirname(file)).toBe(directory);
  expect(await readFile(file, "utf8")).toBe("[0:v]format=rgba[source];[source]null[result]");
  if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
});
it("does not overwrite another graph in the same job directory", async () => {
  const directory = await temporaryDirectory();
  const first = await cutFilterGraphArgs(directory, ["[0:v]null[one]"], modernOption);
  const second = await cutFilterGraphArgs(directory, ["[0:v]null[two]"], modernOption);
  expect(first[1]).not.toBe(second[1]);
  expect(await readFile(first[1], "utf8")).toContain("[one]");
});
it("selects the advertised legacy option for older engines and the file prefix after its removal", () => {
  expect(selectCutFilterFileOption(" -filter_complex graph\n -filter_complex_script filename\n")).toBe("-filter_complex_script");
  expect(selectCutFilterFileOption(" -filter_complex graph\n -another option\n")).toBe("-/filter_complex");
  expect(() => selectCutFilterFileOption("unexpected executable output")).toThrow(/support/);
});
it("does not create a graph when the installed-engine check fails", async () => {
  const directory = await temporaryDirectory();
  await expect(cutFilterGraphArgs(directory, ["[0:v]null[result]"], async () => { throw new Error("engine check failed"); })).rejects.toThrow(/engine check failed/);
  expect(await readdir(directory)).toEqual([]);
});
it("rejects empty and oversized generated data before creating a file", async () => {
  const directory = await temporaryDirectory();
  await expect(cutFilterGraphArgs(directory, [])).rejects.toThrow(/empty/);
  await expect(cutFilterGraphArgs(directory, ["é".repeat(4 * 1024 * 1024 + 1)])).rejects.toThrow(/8 MiB/);
  expect(await readdir(directory)).toEqual([]);
});
