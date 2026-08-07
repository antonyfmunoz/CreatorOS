export type DistributionPlatform =
  "CreativesOS" | "Instagram" | "TikTok" | "YouTube" | "X" | "LinkedIn";
export type DistributionJob = {
  id: string;
  content: string;
  format: "Text" | "Image" | "Video" | "Story";
  platforms: DistributionPlatform[];
  assetIds?: string[];
  scheduledFor: string;
  status:
    | "scheduled"
    | "processing"
    | "published"
    | "needs_connection"
    | "needs_provider"
    | "failed";
  createdAt: string;
  deliveries?: DistributionDelivery[];
};

export type DistributionDelivery = {
  id: string;
  provider: string;
  status:
    "waiting_for_connection" | "waiting_for_provider" | "published" | "failed";
  attemptCount: number;
  providerContentId: string | null;
  errorCode: string | null;
  nextAttemptAt: string | null;
  updatedAt: string;
};

export type SocialConnection = {
  id: string;
  provider: string;
  providerAccountName: string;
  status: string;
  scopes: string[];
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DistributionConnectionsResponse = {
  providers: Array<{
    id: string;
    label: string;
    connectionConfigured: boolean;
    connectionAvailable: boolean;
    connections: SocialConnection[];
  }>;
};
