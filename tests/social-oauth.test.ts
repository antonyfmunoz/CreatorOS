import { describe, expect, it } from "vitest";
import { socialOAuthProviderForId } from "../shared/social-distribution";
import {
  buildSocialOAuthAuthorizationUrl,
  createSocialOAuthState,
  decryptSocialToken,
  encryptSocialToken,
  hashSocialOAuthState,
  isSocialTokenEncryptionConfigured,
  socialOAuthRedirectUri,
} from "../server/social-oauth";

const key = Buffer.alloc(32, 9).toString("base64");
const environment = {
  PUBLIC_APP_URL: "https://creativesos.net",
  SOCIAL_TOKEN_ENCRYPTION_KEY: key,
  YOUTUBE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  YOUTUBE_CLIENT_SECRET: "server-only-secret",
};

describe("social OAuth security boundary", () => {
  it("uses authenticated encryption for token material", () => {
    const encrypted = encryptSocialToken("access-token", environment);
    expect(encrypted).not.toContain("access-token");
    expect(decryptSocialToken(encrypted, environment)).toBe("access-token");
    expect(() =>
      decryptSocialToken(`${encrypted}tampered`, environment),
    ).toThrow();
  });

  it("creates opaque single-use state values", () => {
    const state = createSocialOAuthState();
    expect(state.value).not.toContain(state.hash);
    expect(hashSocialOAuthState(state.value)).toBe(state.hash);
  });

  it("builds a YouTube authorization URL without exposing the client secret", () => {
    const youtube = socialOAuthProviderForId("youtube")!;
    const url = new URL(
      buildSocialOAuthAuthorizationUrl(youtube, "opaque-state", environment),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://creativesos.net/api/distribution/connections/youtube/callback",
    );
    expect(url.searchParams.get("scope")).toContain("youtube.upload");
    expect(url.searchParams.get("scope")).toContain("youtube.readonly");
    expect(url.toString()).not.toContain(environment.YOUTUBE_CLIENT_SECRET);
    expect(socialOAuthRedirectUri(youtube, environment)).toBe(
      "https://creativesos.net/api/distribution/connections/youtube/callback",
    );
    expect(isSocialTokenEncryptionConfigured(environment)).toBe(true);
  });
});
