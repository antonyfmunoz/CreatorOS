#!/usr/bin/env node
// Performs a non-user, short-lived production R2 field test. It writes one
// random marker, verifies that the configured public domain serves it, then
// deletes that exact marker. No values or content are logged.
const { execFileSync } = require("child_process");
const { randomUUID } = require("crypto");
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

function read(field) {
  return execFileSync("op", ["read", `op://CreativesOS/Development/${field}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main() {
  const accountId = read("R2_ACCOUNT_ID");
  const accessKeyId = read("R2_ACCESS_KEY_ID");
  const secretAccessKey = read("R2_SECRET_ACCESS_KEY");
  const bucket = read("R2_BUCKET_NAME");
  const publicBaseUrl = read("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const marker = `creativesos-r2-field-test-${randomUUID()}`;
  const key = `creativesos/production/verification/${randomUUID()}.txt`;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: marker,
      ContentType: "text/plain; charset=utf-8",
      CacheControl: "no-store",
    }));
    const response = await fetch(`${publicBaseUrl}/${key}`, { cache: "no-store" });
    if (!response.ok || await response.text() !== marker) {
      throw new Error(`Public R2 retrieval failed with HTTP ${response.status}`);
    }
    process.stdout.write("R2 authenticated upload and public-domain retrieval verified.\n");
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "R2 field test failed"}\n`);
  process.exit(1);
});
