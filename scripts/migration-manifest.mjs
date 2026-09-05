import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Drizzle only executes migrations recorded in meta/_journal.json. Reject an
 * orphaned SQL file (or a journal entry without its SQL) before touching a
 * database so a checked-in schema change can never be silently skipped.
 */
export function assertMigrationManifest(migrationsFolder) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const journalTags = new Set(journal.entries.map((entry) => entry.tag));
  const sqlTags = new Set(
    readdirSync(migrationsFolder)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.basename(name, ".sql")),
  );
  const unregisteredSql = [...sqlTags].filter((tag) => !journalTags.has(tag));
  const missingSql = [...journalTags].filter((tag) => !sqlTags.has(tag));

  if (unregisteredSql.length > 0 || missingSql.length > 0) {
    throw new Error(
      `Migration manifest mismatch: unregistered SQL [${unregisteredSql.join(", ")}]; missing SQL [${missingSql.join(", ")}]`,
    );
  }
}
