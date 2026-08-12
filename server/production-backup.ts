import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { and, eq, lt, or } from "drizzle-orm";
import { productionBackups } from "@shared/schema";
import { db } from "./db";
import { persistSystemPrivateFile } from "./asset-storage";
import { captureServerException, structuredLog } from "./observability";

function utcDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function backupPrefix(now = new Date()) {
  const [year, month, day] = utcDateKey(now).split("-");
  return `creativesos/${process.env.NODE_ENV ?? "development"}/private/system/backups/${year}/${month}/${day}`;
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function runPgDump(destination: string) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for backup");
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env, PGDATABASE: process.env.DATABASE_URL };
  delete childEnvironment.DATABASE_URL;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", [
      "--format=custom",
      "--compress=9",
      "--no-owner",
      "--no-acl",
      `--file=${destination}`,
    ], { env: childEnvironment, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${stderr}`)));
  });
}

export async function createProductionBackup(now = new Date()) {
  if (process.env.NODE_ENV !== "production") throw new Error("Production backups only run in production");
  const dateKey = utcDateKey(now);
  let [run] = await db.insert(productionBackups).values({ dateKey }).onConflictDoNothing().returning();
  if (!run) {
    const [existing] = await db.select().from(productionBackups).where(eq(productionBackups.dateKey, dateKey)).limit(1);
    if (!existing) throw new Error("Backup concurrency state could not be resolved");
    if (existing.status === "completed") return { status: "completed", dateKey, duplicate: true };
    const staleBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    [run] = await db.update(productionBackups).set({
      status: "running",
      failureCode: null,
      startedAt: now,
      updatedAt: now,
    }).where(and(
      eq(productionBackups.dateKey, dateKey),
      or(eq(productionBackups.status, "failed"), lt(productionBackups.startedAt, staleBefore)),
    )).returning();
    if (!run) return { status: "running", dateKey, duplicate: true };
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-backup-"));
  const dumpPath = path.join(root, `creativesos-${dateKey}-${randomUUID()}.dump`);
  const manifestPath = `${dumpPath}.manifest.json`;
  try {
    await runPgDump(dumpPath);
    const file = await fs.stat(dumpPath);
    const sha256 = await sha256File(dumpPath);
    const prefix = backupPrefix(now);
    const storageKey = `${prefix}/${path.basename(dumpPath)}`;
    const manifestStorageKey = `${storageKey}.manifest.json`;
    const manifest = {
      schemaVersion: "creativesos.backup-manifest.v2",
      createdAt: new Date().toISOString(),
      dateKey,
      filename: path.basename(dumpPath),
      sizeBytes: file.size,
      sha256,
      format: "postgres-custom",
      storage: "r2-private",
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest), { encoding: "utf8", flag: "wx" });
    await persistSystemPrivateFile({ sourcePath: dumpPath, storageKey, mimeType: "application/vnd.postgresql.custom-dump" });
    await persistSystemPrivateFile({ sourcePath: manifestPath, storageKey: manifestStorageKey, mimeType: "application/json" });
    await db.update(productionBackups).set({
      status: "completed", storageKey, manifestStorageKey, sizeBytes: file.size,
      sha256, completedAt: new Date(), updatedAt: new Date(), failureCode: null,
    }).where(eq(productionBackups.id, run.id));
    structuredLog("info", "backup.completed", { backupId: run.id, dateKey, sizeBytes: file.size });
    return { status: "completed", backupId: run.id, dateKey, sizeBytes: file.size, sha256 };
  } catch (error) {
    await db.update(productionBackups).set({ status: "failed", failureCode: error instanceof Error ? error.name : "unknown", updatedAt: new Date() }).where(eq(productionBackups.id, run.id));
    captureServerException(error, { event: "backup.failed", backupId: run.id, dateKey });
    throw error;
  } finally {
    const resolvedRoot = path.resolve(root);
    if (resolvedRoot.startsWith(path.resolve(os.tmpdir(), "creativesos-backup-"))) {
      await fs.rm(resolvedRoot, { recursive: true, force: true });
    }
  }
}
