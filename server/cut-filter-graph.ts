import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/** Private compiler output, never a user-controlled filter program or path. */
export async function cutFilterGraphArgs(temp: string, filters: readonly string[]): Promise<[string, string]> {
  const graph = filters.join(";");
  if (!graph.trim()) throw new Error("Native filter graph cannot be empty");
  if (Buffer.byteLength(graph, "utf8") > 8 * 1024 * 1024) throw new Error("Native filter graph exceeds the 8 MiB compilation budget");
  const file = path.join(temp, `native-filter-${randomUUID()}.txt`);
  await writeFile(file, graph, { encoding: "utf8", flag: "wx", mode: 0o600 });
  // The former -filter_complex_script alias was removed from newer FFmpeg.
  // Slash-prefixed options load their argument from a file on supported 8.x
  // and the pinned current Linux build, without OS command-line size limits.
  return ["-/filter_complex", file];
}
