import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

type FilterFileOption = "-filter_complex_script" | "-/filter_complex";
const inspect = promisify(execFile);
let installedOption: Promise<FilterFileOption> | undefined;

export function selectCutFilterFileOption(help: string): FilterFileOption {
  if (/(?:^|\n)\s*-filter_complex_script\s/.test(help)) return "-filter_complex_script";
  if (/(?:^|\n)\s*-filter_complex\s/.test(help)) return "-/filter_complex";
  throw new Error("Installed FFmpeg does not advertise complex-filter support");
}

async function installedCutFilterFileOption(): Promise<FilterFileOption> {
  // Production Bookworm and the newer qualification build expose different
  // CLI generations. Inspect once per worker, never guess from a Git version
  // string or downgrade the installed media engine to make a test pass.
  if (!installedOption) {
    installedOption = inspect("ffmpeg", ["-hide_banner", "-h", "full"], { encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 4 * 1024 * 1024 })
      .then(({ stdout, stderr }) => selectCutFilterFileOption(`${stdout}\n${stderr}`))
      .catch((error) => { installedOption = undefined; throw error; });
  }
  return installedOption;
}

/** Private compiler output, never a user-controlled filter program or path. */
export async function cutFilterGraphArgs(temp: string, filters: readonly string[], resolveOption: () => Promise<FilterFileOption> = installedCutFilterFileOption): Promise<[string, string]> {
  const graph = filters.join(";");
  if (!graph.trim()) throw new Error("Native filter graph cannot be empty");
  if (Buffer.byteLength(graph, "utf8") > 8 * 1024 * 1024) throw new Error("Native filter graph exceeds the 8 MiB compilation budget");
  const option = await resolveOption();
  const file = path.join(temp, `native-filter-${randomUUID()}.txt`);
  await writeFile(file, graph, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return [option, file];
}
