import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const key = process.argv[2];
if (!key) throw new Error("Usage: node scripts/inspect-private-room-recording.mjs <object-key>");
for (const name of [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PRIVATE_BUCKET_NAME",
])
  if (!process.env[name]) throw new Error(`${name} is required`);

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const object = await client.send(
  new HeadObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET_NAME, Key: key }),
);
process.stdout.write(
  `${JSON.stringify({
    key,
    contentLength: object.ContentLength,
    contentType: object.ContentType,
    lastModified: object.LastModified,
    metadata: object.Metadata,
  }, null, 2)}\n`,
);
