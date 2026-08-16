import crypto from "node:crypto";

const cipherVersion = "v1";

function dataKey(
  environment: Record<string, string | undefined> = process.env,
): Buffer | null {
  const encoded = (
    environment.CREATOROS_DATA_ENCRYPTION_KEY ??
    environment.SOCIAL_TOKEN_ENCRYPTION_KEY
  )?.trim();
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 ? key : null;
}

export function isSensitiveDataEncryptionConfigured(
  environment: Record<string, string | undefined> = process.env,
) {
  return dataKey(environment) !== null;
}

export function encryptSensitiveValue(
  value: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const key = dataKey(environment);
  if (!key)
    throw new Error(
      "CREATOROS_DATA_ENCRYPTION_KEY or SOCIAL_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 key",
    );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    cipherVersion,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Produces a domain-separated, non-reversible identifier for sensitive values
 * that need deterministic equality checks without storing a plain digest.
 */
export function fingerprintSensitiveValue(
  value: string,
  purpose: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const key = dataKey(environment);
  if (!key) throw new Error("Sensitive-data encryption is not configured");
  return crypto
    .createHmac("sha256", key)
    .update(`${purpose}\0`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function decryptSensitiveValue(
  encoded: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const key = dataKey(environment);
  if (!key) throw new Error("Sensitive-data encryption is not configured");
  const [version, iv, tag, ciphertext, ...extra] = encoded.split(".");
  if (version !== cipherVersion || !iv || !tag || !ciphertext || extra.length)
    throw new Error("Invalid encrypted sensitive value");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptSensitiveJson(value: unknown) {
  return encryptSensitiveValue(JSON.stringify(value));
}

export function decryptSensitiveJson<T>(encoded: string): T {
  return JSON.parse(decryptSensitiveValue(encoded)) as T;
}
