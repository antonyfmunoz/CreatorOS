type YouTubeRefreshResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
};

export type YouTubeAccessToken = {
  accessToken: string;
  expiresAt: Date | null;
};

export async function refreshYouTubeAccessToken(
  refreshToken: string,
  environment: Record<string, string | undefined> = process.env,
): Promise<YouTubeAccessToken> {
  const clientId = environment.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = environment.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new Error("YouTube OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok)
    throw new Error(`YouTube token refresh failed with ${response.status}`);
  const payload = (await response.json()) as YouTubeRefreshResponse;
  if (typeof payload.access_token !== "string" || !payload.access_token)
    throw new Error("YouTube token refresh returned no access token");
  return {
    accessToken: payload.access_token,
    expiresAt:
      typeof payload.expires_in === "number" &&
      Number.isFinite(payload.expires_in)
        ? new Date(Date.now() + payload.expires_in * 1000)
        : null,
  };
}

export async function uploadYouTubeVideo(input: {
  accessToken: string;
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  mediaUrl: string;
}): Promise<string> {
  if (!input.mimeType.startsWith("video/"))
    throw new Error("YouTube delivery requires a video asset");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 1)
    throw new Error("YouTube delivery requires a sized video asset");
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.sizeBytes),
      },
      body: JSON.stringify({
        snippet: {
          title: input.title.slice(0, 100),
          description: input.description.slice(0, 5000),
        },
        // Test uploads must remain non-public until a creator changes the
        // publishing policy in a future release.
        status: { privacyStatus: "unlisted" },
      }),
    },
  );
  const uploadUrl = init.headers.get("location");
  if (!init.ok || !uploadUrl)
    throw new Error(`YouTube upload initialization failed with ${init.status}`);
  const media = await fetch(input.mediaUrl);
  if (!media.ok || !media.body)
    throw new Error("CreativesOS could not read the selected video asset");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": input.mimeType,
      "Content-Length": String(input.sizeBytes),
    },
    body: media.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!upload.ok)
    throw new Error(`YouTube video upload failed with ${upload.status}`);
  const result = (await upload.json()) as { id?: unknown };
  if (typeof result.id !== "string" || !result.id)
    throw new Error("YouTube upload returned no video id");
  return result.id;
}
