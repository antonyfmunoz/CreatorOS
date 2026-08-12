#!/usr/bin/env node
// Provisions the private counterpart to the public CreativesOS media bucket.
// Credentials are read from 1Password into process memory only and never
// printed or written to a file.
const { execFileSync } = require("child_process");
const { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } = require("@aws-sdk/client-s3");

const bucket = process.argv[2] || "creativesos-private-production";
if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error("Bucket name must be a valid lowercase DNS-style name");
}

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
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  let created = false;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status && status !== 404 && status !== 403) throw error;
    await client.send(new CreateBucketCommand({
      Bucket: bucket,
      CreateBucketConfiguration: { LocationConstraint: "enam" },
    }));
    created = true;
  }

  // Direct browser uploads need CORS, but only from the production app origin.
  await client.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ["https://creativesos.net"],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ["content-type"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      }],
    },
  }));

  process.stdout.write(JSON.stringify({ bucket, created, cors: "configured", visibility: "private" }));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to provision private R2 bucket"}\n`);
  process.exit(1);
});
