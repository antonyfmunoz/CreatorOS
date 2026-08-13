import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import postgres from "postgres";

const execFileAsync = promisify(execFile);
const required = ["DATABASE_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET_NAME"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(", ")}`);

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 5 });
const root = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-production-backup-verification-"));
const dumpPath = path.join(root, "production.dump");
try {
  const [backup] = await sql`
    select id, date_key, status, storage_key, manifest_storage_key, size_bytes, sha256, completed_at
    from production_backups
    order by date_key desc, id desc
    limit 1
  `;
  if (!backup || backup.status !== "completed" || !backup.storage_key || !backup.manifest_storage_key) {
    throw new Error("No completed production backup with durable object keys was found");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
  const [dumpObject, manifestObject] = await Promise.all([
    client.send(new GetObjectCommand({ Bucket: bucket, Key: backup.storage_key })),
    client.send(new GetObjectCommand({ Bucket: bucket, Key: backup.manifest_storage_key })),
  ]);
  if (!dumpObject.Body || !manifestObject.Body) throw new Error("Production backup objects had no body");
  const manifest = JSON.parse(await manifestObject.Body.transformToString());
  await pipeline(dumpObject.Body, createWriteStream(dumpPath, { flags: "wx", mode: 0o600 }));

  const file = await fs.stat(dumpPath);
  const actualSha256 = await sha256File(dumpPath);
  const sizeMatches = file.size === Number(backup.size_bytes) && Number(dumpObject.ContentLength) === file.size && Number(manifest.sizeBytes) === file.size;
  const hashMatches = manifest.sha256 === backup.sha256 && actualSha256 === backup.sha256;
  if (!sizeMatches || !hashMatches || manifest.schemaVersion !== "creativesos.backup-manifest.v2") {
    throw new Error("Production backup evidence did not match its durable manifest");
  }

  const { stdout: archiveList } = await execFileAsync("pg_restore", ["--list", dumpPath], { maxBuffer: 10 * 1024 * 1024 });
  const requiredArchiveTables = ["users", "posts", "orders", "production_backups", "broadcast_studios", "broadcast_template_catalog", "broadcast_destinations", "broadcast_sessions", "broadcast_audience_messages"];
  const missingArchiveTables = requiredArchiveTables.filter((table) => !new RegExp(`TABLE public ${table}(?:\\r?\\n|\\s)`).test(archiveList));
  if (missingArchiveTables.length) throw new Error(`Production archive is missing required tables: ${missingArchiveTables.join(", ")}`);

  process.stdout.write(`${JSON.stringify({
    status: "production_backup_verified",
    backupId: backup.id,
    dateKey: backup.date_key,
    completedAt: backup.completed_at,
    sizeBytes: file.size,
    sizeMatches,
    hashMatches,
    archiveReadable: true,
    requiredArchiveTables: requiredArchiveTables.length,
    privateBucket: true,
  })}\n`);
} finally {
  await sql.end();
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot.startsWith(path.resolve(os.tmpdir(), "creativesos-production-backup-verification-"))) {
    await fs.rm(resolvedRoot, { recursive: true, force: true });
  }
}
