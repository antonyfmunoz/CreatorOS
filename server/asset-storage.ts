import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import type { AssetVisibility } from "./asset-policy";

export type StoredUpload = { storageKey: string; publicUrl: string };
export type DirectUpload = { storageKey: string; uploadUrl: string; expiresAt: string; storageProvider: "r2" };

function configuredR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) throw new Error("R2 asset storage is not fully configured");
  return {
    client: new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } }),
    bucket,
    publicBaseUrl,
  };
}

function r2BucketFor(visibility: AssetVisibility) {
  const configured = configuredR2Client();
  if (visibility === "public") return configured;
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
  if (!bucket) throw new Error("Private asset storage is not configured");
  return { ...configured, bucket };
}

function extensionFor(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  return extension && /^[.a-z0-9]{1,12}$/.test(extension) ? extension : "";
}

function safeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return extension && /^[.a-z0-9]{1,12}$/.test(extension) ? extension : "";
}

function managedUploadRoot() {
  return process.env.CREATOROS_UPLOAD_DIR
    ? path.resolve(process.env.CREATOROS_UPLOAD_DIR)
    : path.resolve(process.cwd(), "uploads");
}

function safeLocalUploadPath(candidate: string) {
  const uploadRoot = managedUploadRoot();
  const resolved = path.resolve(candidate);
  if (resolved !== uploadRoot && !resolved.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error("Upload path escaped the managed upload directory");
  }
  return resolved;
}

function localStoragePath(storageKey: string) {
  if (path.isAbsolute(storageKey)) throw new Error("Local storage key must be relative");
  return safeLocalUploadPath(path.resolve(managedUploadRoot(), storageKey));
}

export function directUploadStorageKey(ownerUserId: number, kind: string, filename: string, visibility: AssetVisibility) {
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  if (!safeKind) throw new Error("Invalid asset kind");
  return `creativesos/${process.env.NODE_ENV ?? "development"}/${visibility}/users/${ownerUserId}/${safeKind}/${randomUUID()}${safeExtension(filename)}`;
}

export async function createDirectUpload(ownerUserId: number, kind: string, filename: string, mimeType: string, visibility: AssetVisibility): Promise<DirectUpload> {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider !== "r2") throw new Error("Direct uploads require R2 asset storage");
  const { client, bucket } = r2BucketFor(visibility);
  const storageKey = directUploadStorageKey(ownerUserId, kind, filename, visibility);
  const expiresInSeconds = 5 * 60;
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
    CacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    Metadata: { owner: String(ownerUserId), kind, visibility },
  }), { expiresIn: expiresInSeconds });
  return { storageKey, uploadUrl, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(), storageProvider: "r2" };
}

export async function inspectDirectUpload(storageKey: string, visibility: AssetVisibility) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider !== "r2") throw new Error("Direct uploads require R2 asset storage");
  const { client, bucket, publicBaseUrl } = r2BucketFor(visibility);
  const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
  return {
    sizeBytes: object.ContentLength ?? 0,
    mimeType: object.ContentType ?? "application/octet-stream",
    publicUrl: visibility === "public" ? `${publicBaseUrl}/${storageKey}` : null,
  };
}

export async function createPrivateAssetReadUrl(storageKey: string) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider !== "r2") throw new Error("Private downloads require R2 asset storage");
  const { client, bucket } = r2BucketFor("private");
  const expiresInSeconds = 5 * 60;
  return {
    url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: storageKey }), { expiresIn: expiresInSeconds }),
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

export async function removeStoredAsset(storageKey: string, visibility: AssetVisibility) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
    await fs.rm(localStoragePath(storageKey), { force: true });
    return;
  }
  if (provider !== "r2") return;
  const { client, bucket } = r2BucketFor(visibility);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

export async function persistPrivateBuffer(input: {
  body: Buffer;
  ownerUserId: number;
  kind: string;
  filename: string;
  mimeType: string;
}) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  const key = directUploadStorageKey(input.ownerUserId, input.kind, input.filename, "private");
  if (provider === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("Private production asset storage is not configured");
    const localPath = localStoragePath(key);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, input.body, { flag: "wx" });
    return { storageKey: key, sizeBytes: input.body.byteLength };
  }
  if (provider !== "r2") throw new Error("Unsupported asset storage provider");
  const { client, bucket } = r2BucketFor("private");
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.body,
    ContentType: input.mimeType,
    CacheControl: "private, no-store",
    Metadata: { owner: String(input.ownerUserId), kind: input.kind, visibility: "private" },
  }));
  return { storageKey: key, sizeBytes: input.body.byteLength };
}

export async function persistPrivateFile(input: {
  sourcePath: string;
  ownerUserId: number;
  kind: string;
  filename: string;
  mimeType: string;
}) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  const key = directUploadStorageKey(input.ownerUserId, input.kind, input.filename, "private");
  const file = await fs.stat(input.sourcePath);
  if (provider === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("Private production asset storage is not configured");
    const localPath = localStoragePath(key);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.copyFile(input.sourcePath, localPath);
    return { storageKey: key, sizeBytes: file.size };
  }
  if (provider !== "r2") throw new Error("Unsupported asset storage provider");
  const { client, bucket } = r2BucketFor("private");
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(input.sourcePath),
    ContentLength: file.size,
    ContentType: input.mimeType,
    CacheControl: "private, no-store",
    Metadata: { owner: String(input.ownerUserId), kind: input.kind, visibility: "private" },
  }));
  return { storageKey: key, sizeBytes: file.size };
}

export async function materializePrivateAsset(storageKey: string, destination: string) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
    const source = localStoragePath(storageKey);
    await fs.copyFile(source, destination);
    return destination;
  }
  if (provider !== "r2") throw new Error("Unsupported asset storage provider");
  const { client, bucket } = r2BucketFor("private");
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (!object.Body) throw new Error("Private asset body was unavailable");
  await pipeline(object.Body as NodeJS.ReadableStream, createWriteStream(destination));
  return destination;
}

export async function promotePrivateAsset(input: {
  storageKey: string;
  ownerUserId: number;
  kind: string;
  filename: string;
  mimeType: string;
}) {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("Publishing private media requires R2 asset storage");
    const sourcePath = localStoragePath(input.storageKey);
    const key = directUploadStorageKey(input.ownerUserId, input.kind, input.filename, "public");
    const destinationPath = localStoragePath(key);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    const stored = await fs.stat(destinationPath);
    return { storageKey: key, publicUrl: `/uploads/${key.replace(/\\/g, "/")}`, sizeBytes: stored.size };
  }
  if (provider !== "r2") throw new Error("Publishing private media requires R2 asset storage");
  const privateStore = r2BucketFor("private");
  const publicStore = r2BucketFor("public");
  const source = await privateStore.client.send(new GetObjectCommand({ Bucket: privateStore.bucket, Key: input.storageKey }));
  if (!source.Body) throw new Error("Private asset body was unavailable");
  const key = directUploadStorageKey(input.ownerUserId, input.kind, input.filename, "public");
  await publicStore.client.send(new PutObjectCommand({
    Bucket: publicStore.bucket,
    Key: key,
    Body: source.Body,
    ContentLength: source.ContentLength,
    ContentType: input.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: { owner: String(input.ownerUserId), kind: input.kind, visibility: "public" },
  }));
  return { storageKey: key, publicUrl: `${publicStore.publicBaseUrl}/${key}`, sizeBytes: source.ContentLength ?? 0 };
}

export async function persistSystemPrivateFile(input: {
  sourcePath: string;
  storageKey: string;
  mimeType: string;
}) {
  if (!/^creativesos\/(production|development)\/private\/system\/[a-zA-Z0-9/_.-]+$/.test(input.storageKey)) {
    throw new Error("Invalid system-private storage key");
  }
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider !== "r2") throw new Error("System-private storage requires R2");
  const { client, bucket } = r2BucketFor("private");
  const file = await fs.stat(input.sourcePath);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    Body: createReadStream(input.sourcePath),
    ContentLength: file.size,
    ContentType: input.mimeType,
    CacheControl: "private, no-store",
    Metadata: { kind: "system-backup", visibility: "private" },
  }));
  const stored = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.storageKey }));
  if (stored.ContentLength !== file.size) throw new Error("Stored backup size did not match the source");
  return { storageKey: input.storageKey, sizeBytes: file.size };
}

export async function persistUpload(file: Express.Multer.File, ownerUserId: number, kind: string): Promise<StoredUpload> {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
    const safeFilename = path.basename(file.filename);
    if (!safeFilename || safeFilename !== file.filename) throw new Error("Invalid local upload filename");
    return { storageKey: `uploads/${safeFilename}`, publicUrl: `/uploads/${safeFilename}` };
  }
  if (provider !== "r2") throw new Error("Unsupported asset storage provider");

  const localPath = safeLocalUploadPath(file.path);
  const { client, bucket, publicBaseUrl } = configuredR2Client();
  const key = `creativesos/${process.env.NODE_ENV ?? "development"}/users/${ownerUserId}/${kind}/${randomUUID()}${extensionFor(file)}`;
  const body = await fs.readFile(localPath);
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: file.mimetype, CacheControl: "public, max-age=31536000, immutable", Metadata: { owner: String(ownerUserId), kind } }));
    return { storageKey: key, publicUrl: `${publicBaseUrl}/${key}` };
  } finally {
    await fs.unlink(localPath).catch(() => undefined);
  }
}

export async function discardUploadedFiles(files: Array<Express.Multer.File | undefined>) {
  await Promise.all(files.filter((file): file is Express.Multer.File => Boolean(file)).map(async (file) => {
    const localPath = safeLocalUploadPath(file.path);
    await fs.unlink(localPath).catch(() => undefined);
  }));
}

export function assetStorageReadiness() {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "r2") return { provider, configured: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PRIVATE_BUCKET_NAME && process.env.R2_PUBLIC_BASE_URL) };
  return { provider, configured: process.env.NODE_ENV !== "production" };
}
