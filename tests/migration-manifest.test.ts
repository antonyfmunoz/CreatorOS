import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(projectRoot, "migrations");

describe("migration manifest", () => {
  it("registers every checked-in SQL migration with Drizzle", () => {
    const journal = JSON.parse(
      readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    const journalTags = journal.entries.map((entry) => entry.tag).sort();
    const sqlTags = readdirSync(migrationsFolder)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.basename(name, ".sql"))
      .sort();

    expect(journalTags).toEqual(sqlTags);
  });
});
