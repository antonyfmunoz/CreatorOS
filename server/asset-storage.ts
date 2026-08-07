import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import fs from "fs/promises";
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
  if (provider !== "r2") return;
  const { client, bucket } = r2BucketFor(visibility);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

export async function persistUpload(file: Express.Multer.File, ownerUserId: number, kind: string): Promise<StoredUpload> {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "local") return { storageKey: `uploads/${file.filename}`, publicUrl: `/uploads/${file.filename}` };
  if (provider !== "r2") throw new Error("Unsupported asset storage provider");

  const { client, bucket, publicBaseUrl } = configuredR2Client();
  const key = `creativesos/${process.env.NODE_ENV ?? "development"}/users/${ownerUserId}/${kind}/${randomUUID()}${extensionFor(file)}`;
  const body = await fs.readFile(file.path);
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: file.mimetype, CacheControl: "public, max-age=31536000, immutable", Metadata: { owner: String(ownerUserId), kind } }));
    return { storageKey: key, publicUrl: `${publicBaseUrl}/${key}` };
  } finally {
    await fs.unlink(file.path).catch(() => undefined);
  }
}

export async function discardUploadedFiles(files: Array<Express.Multer.File | undefined>) {
  await Promise.all(files.filter((file): file is Express.Multer.File => Boolean(file)).map((file) => fs.unlink(file.path).catch(() => undefined)));
}

export function assetStorageReadiness() {
  const provider = process.env.ASSET_STORAGE_PROVIDER ?? "local";
  if (provider === "r2") return { provider, configured: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_BASE_URL) };
  return { provider, configured: process.env.NODE_ENV !== "production" };
}
