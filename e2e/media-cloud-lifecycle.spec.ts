import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.setTimeout(90_000);

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("Media Cloud supports upload, search, collections, preview, and deletion", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByRole("button", { name: "Open Media Cloud" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.getByRole("heading", { name: "Media Cloud" }),
  ).toBeVisible();

  await page.getByLabel("Upload visibility").selectOption("private");
  await page.locator('input[type="file"]').setInputFiles({
    name: "media-cloud-field-test.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(
    page.getByText(
      "media-cloud-field-test.png is in your library and processing now.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("media-cloud-field-test.png", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Search media library").fill("field-test");
  await page.getByText("media-cloud-field-test.png", { exact: true }).click();
  await expect(
    page.locator('img[alt="media-cloud-field-test.png"]'),
  ).toBeVisible();

  await page.getByLabel("New asset tag").fill("field-test");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "#field-test ×" }),
  ).toBeVisible();
  await page
    .getByLabel("Rights holder")
    .fill("CreativesOS qualification owner");
  await page.getByRole("button", { name: "Save rights" }).click();
  await expect(page.getByText("Rights and provenance saved.")).toBeVisible();

  await page.getByLabel("New collection name").fill("Field test selects");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(
    page.getByRole("button", { name: /Field test selects/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Field test selects", exact: true })
    .click();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove asset" }).click();
  await expect(
    page.getByText("media-cloud-field-test.png", { exact: true }),
  ).toHaveCount(0);
});

test("a published video post opens an authorized player and records playback telemetry", async ({
  page,
}) => {
  await page.goto("/");
  const directory = mkdtempSync(join(tmpdir(), "creativesos-playback-"));
  const filePath = join(directory, "feed-playback.mp4");
  const generated = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x90:rate=15",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      filePath,
    ],
    { encoding: "utf8", timeout: 30_000, windowsHide: true },
  );
  if (generated.status !== 0)
    throw new Error(`Unable to generate playback fixture: ${generated.stderr}`);
  const video = readFileSync(filePath);
  rmSync(directory, { recursive: true, force: true });

  const content = `Media Cloud playback ${Date.now()}`;
  const published = await page.request.post("/api/posts/media", {
    multipart: {
      content,
      mediaType: "video",
      video: {
        name: "feed-playback.mp4",
        mimeType: "video/mp4",
        buffer: video,
      },
    },
  });
  expect(published.status()).toBe(201);
  const post = (await published.json()) as {
    id: number;
    mediaAssetId: string | null;
  };
  expect(post.mediaAssetId).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto("/");
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/media/playback/sessions") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Open video" }).first().click();
  const session = await sessionResponse;
  expect([200, 201]).toContain(session.status());
  const descriptor = (await session.json()) as {
    session: { id: string };
    asset: { id: string };
  };
  expect(descriptor.asset.id).toBe(post.mediaAssetId);

  const telemetryResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(
          `/api/media/playback/sessions/${descriptor.session.id}/events`,
        ) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Play video" }).first().click();
  const telemetry = await telemetryResponse;
  expect(telemetry.status()).toBe(202);
  const postPerformance = (await (
    await page.request.get(`/api/posts/${post.id}/analytics`)
  ).json()) as {
    playbackSessions: number;
    uniqueViewers: number;
    watchMs: number;
    averageWatchMs: number;
    engagementRate: number;
  };
  expect(postPerformance.playbackSessions).toBeGreaterThanOrEqual(1);
  expect(postPerformance.uniqueViewers).toBeGreaterThanOrEqual(1);
  expect(postPerformance.watchMs).toBeGreaterThanOrEqual(0);
  expect(postPerformance.averageWatchMs).toBeGreaterThanOrEqual(0);
  expect(postPerformance.engagementRate).toBeGreaterThanOrEqual(0);

  const analyticsKey = `field-event-${crypto.randomUUID()}`;
  const analyticsPayload = {
    eventName: "content.engaged",
    schemaVersion: 1,
    sessionId: `field-${crypto.randomUUID()}`,
    anonymousId: `anon-${crypto.randomUUID()}`,
    objectType: "post",
    objectId: String(post.id),
    source: "qualification",
    deduplicationKey: analyticsKey,
    consentState: "analytics",
    occurredAt: new Date().toISOString(),
    properties: { action: "field_test" },
    attribution: {
      source: "creativesos",
      medium: "native_feed",
      campaignName: "media-cloud-qualification",
      touchType: "engagement",
      assetId: post.mediaAssetId,
      postId: post.id,
      campaignId: null,
      distributionJobId: null,
      confidence: 1,
    },
  };
  const captured = await page.request.post("/api/analytics/events", {
    data: analyticsPayload,
  });
  expect(captured.status()).toBe(201);
  const duplicate = await page.request.post("/api/analytics/events", {
    data: analyticsPayload,
  });
  expect(duplicate.status()).toBe(200);
  const overview = (await (
    await page.request.get("/api/analytics/overview?days=7")
  ).json()) as {
    metrics: { playbackSessions: number };
    events: Record<string, number>;
  };
  expect(overview.metrics.playbackSessions).toBeGreaterThanOrEqual(1);
  expect(overview.events["content.engaged"]).toBeGreaterThanOrEqual(1);
  await page.goto("/business/analytics");
  await expect(
    page.getByRole("heading", { name: "Creator intelligence" }),
  ).toBeVisible();
  await expect(page.getByTestId("analytics-playback")).toContainText(/[1-9]/);

  const library = (await (
    await page.request.get("/api/media/assets")
  ).json()) as Array<{ id: string; rights: Array<{ id: string }> }>;
  const mediaAsset = library.find((asset) => asset.id === post.mediaAssetId);
  expect(mediaAsset?.rights[0]?.id).toBeTruthy();
  const revoked = await page.request.post(
    `/api/media/assets/${post.mediaAssetId}/rights/${mediaAsset!.rights[0].id}/status`,
    { data: { status: "revoked" } },
  );
  expect(revoked.status()).toBe(200);
  const blockedPlayback = await page.request.post(
    "/api/media/playback/sessions",
    {
      data: {
        assetId: post.mediaAssetId,
        clientSessionId: `blocked-${crypto.randomUUID()}`,
        playerVersion: "qualification",
      },
    },
  );
  expect(blockedPlayback.status()).toBe(404);
});
