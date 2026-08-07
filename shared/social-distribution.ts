export const socialProviderIds = [
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
] as const;

export type SocialProviderId = (typeof socialProviderIds)[number];

export type SocialProviderDefinition = {
  id: SocialProviderId;
  label: string;
  platformLabel: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

export type SocialOAuthProviderDefinition = SocialProviderDefinition & {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: readonly string[];
};

// The account connection is deliberately separate from delivery. A connected
// account does not mean the provider has approved the scopes, app review, or
// production publishing access required to send a post.
export const socialProviderDefinitions: readonly SocialProviderDefinition[] = [
  {
    id: "instagram",
    label: "Instagram",
    platformLabel: "Instagram",
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
  },
  {
    id: "tiktok",
    label: "TikTok",
    platformLabel: "TikTok",
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
  },
  {
    id: "youtube",
    label: "YouTube",
    platformLabel: "YouTube",
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_CLIENT_SECRET",
  },
  {
    id: "x",
    label: "X",
    platformLabel: "X",
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    platformLabel: "LinkedIn",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
] as const;

const providerByPlatform = new Map(
  socialProviderDefinitions.map((provider) => [
    provider.platformLabel,
    provider.id,
  ]),
);

export function socialProviderForPlatform(
  platform: string,
): SocialProviderId | null {
  return providerByPlatform.get(platform) ?? null;
}

export function isSocialProviderConfigured(
  provider: SocialProviderDefinition,
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    environment[provider.clientIdEnv]?.trim() &&
    environment[provider.clientSecretEnv]?.trim(),
  );
}

// Each adapter is enabled deliberately. The generic connection table can model
// every planned network, but only providers with an audited OAuth profile are
// allowed to receive an authorization request.
export const socialOAuthProviders: readonly SocialOAuthProviderDefinition[] = [
  {
    ...socialProviderDefinitions.find((provider) => provider.id === "youtube")!,
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
  },
] as const;

export function socialOAuthProviderForId(
  providerId: string,
): SocialOAuthProviderDefinition | null {
  return (
    socialOAuthProviders.find((provider) => provider.id === providerId) ?? null
  );
}
