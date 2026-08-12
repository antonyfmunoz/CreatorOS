import { afterEach, describe, expect, it, vi } from "vitest";
import {
  refreshYouTubeAccessToken,
  uploadYouTubeVideo,
} from "../server/youtube-delivery";

const environment = {
  YOUTUBE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  YOUTUBE_CLIENT_SECRET: "server-only-secret",
};

afterEach(() => vi.unstubAllGlobals());

describe("YouTube delivery adapter", () => {
  it("refreshes a server-side access token without exposing credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "new-access", expires_in: 3600 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshYouTubeAccessToken(
      "durable-refresh",
      environment,
    );

    expect(token.accessToken).toBe("new-access");
    expect(token.expiresAt).toBeInstanceOf(Date);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://oauth2.googleapis.com/token",
    );
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(
      "grant_type=refresh_token",
    );
  });

  it("rejects non-video input before making an external request", async () => {
    await expect(
      uploadYouTubeVideo({
        accessToken: "access",
        title: "Test",
        description: "Test",
        mimeType: "image/png",
        sizeBytes: 20,
        mediaUrl: "https://assets.example/image.png",
      }),
    ).rejects.toThrow("requires a video asset");
  });

  it("initializes an unlisted resumable upload and records the YouTube video id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { location: "https://upload.example/session" },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2])))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "youtube-video-id" }), {
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadYouTubeVideo({
        accessToken: "access",
        title: "A title",
        description: "A description",
        mimeType: "video/mp4",
        sizeBytes: 2,
        mediaUrl: "https://assets.example/video.mp4",
      }),
    ).resolves.toBe("youtube-video-id");

    const initialize = fetchMock.mock.calls[0][1] as RequestInit;
    expect(initialize.headers).toMatchObject({
      Authorization: "Bearer access",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": "2",
    });
    expect(initialize.body).toContain('"privacyStatus":"unlisted"');
    const upload = fetchMock.mock.calls[2][1] as RequestInit;
    expect(upload.headers).toMatchObject({ Authorization: "Bearer access" });
  });
});
