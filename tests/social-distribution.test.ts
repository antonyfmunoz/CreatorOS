import { describe, expect, it } from "vitest";
import {
  isSocialProviderConfigured,
  socialProviderDefinitions,
  socialProviderForPlatform,
  socialOAuthProviderForId,
} from "../shared/social-distribution";

describe("social distribution provider registry", () => {
  it("maps only supported external platform labels to providers", () => {
    expect(socialProviderForPlatform("Instagram")).toBe("instagram");
    expect(socialProviderForPlatform("TikTok")).toBe("tiktok");
    expect(socialProviderForPlatform("CreativesOS")).toBeNull();
    expect(socialProviderForPlatform("Unrecognized Network")).toBeNull();
  });

  it("requires both halves of a provider credential before offering connection", () => {
    const instagram = socialProviderDefinitions.find(
      (provider) => provider.id === "instagram",
    )!;
    expect(
      isSocialProviderConfigured(instagram, {
        INSTAGRAM_CLIENT_ID: "client-id",
      }),
    ).toBe(false);
    expect(
      isSocialProviderConfigured(instagram, {
        INSTAGRAM_CLIENT_SECRET: "client-secret",
      }),
    ).toBe(false);
    expect(
      isSocialProviderConfigured(instagram, {
        INSTAGRAM_CLIENT_ID: "client-id",
        INSTAGRAM_CLIENT_SECRET: "client-secret",
      }),
    ).toBe(true);
  });

  it("only exposes audited OAuth adapters for connection", () => {
    expect(socialOAuthProviderForId("youtube")?.label).toBe("YouTube");
    expect(socialOAuthProviderForId("instagram")).toBeNull();
  });
});
