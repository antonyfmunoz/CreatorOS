import crypto from "crypto";
import type { SocialOAuthProviderDefinition } from "../shared/social-distribution";

const tokenCipherVersion = "v1";

function encryptionKey(
  environment: Record<string, string | undefined> = process.env,
): Buffer | null {
  const encoded = environment.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 ? key : null;
}

export function isSocialTokenEncryptionConfigured(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return encryptionKey(environment) !== null;
}

export function encryptSocialToken(
  value: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const key = encryptionKey(environment);
  if (!key)
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 key");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    tokenCipherVersion,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSocialToken(
  value: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const key = encryptionKey(environment);
  if (!key)
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 key");
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, ...extra] =
    value.split(".");
  if (
    version !== tokenCipherVersion ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded ||
    extra.length > 0
  ) {
    throw new Error("Invalid encrypted social token");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createSocialOAuthState(): { value: string; hash: string } {
  const value = crypto.randomBytes(32).toString("base64url");
  return { value, hash: hashSocialOAuthState(value) };
}

export function hashSocialOAuthState(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function socialOAuthRedirectUri(
  provider: SocialOAuthProviderDefinition,
  environment: Record<string, string | undefined> = process.env,
): string {
  const baseUrl = environment.PUBLIC_APP_URL?.trim();
  if (!baseUrl) throw new Error("PUBLIC_APP_URL is not configured");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("PUBLIC_APP_URL must use HTTPS outside local development");
  return new URL(
    `/api/distribution/connections/${provider.id}/callback`,
    url,
  ).toString();
}

export function buildSocialOAuthAuthorizationUrl(
  provider: SocialOAuthProviderDefinition,
  state: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const clientId = environment[provider.clientIdEnv]?.trim();
  if (!clientId) throw new Error(`${provider.clientIdEnv} is not configured`);
  const url = new URL(provider.authorizationEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set(
    "redirect_uri",
    socialOAuthRedirectUri(provider, environment),
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);
  // Google only returns a durable refresh token on an offline, consented web
  // authorization. Future adapters can extend this builder deliberately.
  if (provider.id === "youtube") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}
