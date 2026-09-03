import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

for (const frames of [1, 3]) {
  test(`a ${frames}-frame published clip plays its actual HLS rendition without progressive fallback`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const directory = mkdtempSync(path.join(tmpdir(), "creativesos-short-hls-browser-"));
    let videoBytes: Buffer;
    try {
      const source = path.join(directory, "short.mp4");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-frames:v", String(frames), "-c:v", "libx264", "-threads", "1", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
      videoBytes = readFileSync(source);
    } finally { rmSync(directory, { recursive: true, force: true }); }
    await page.goto("/");
    const content = `Short HLS ${frames} ${crypto.randomUUID()}`;
    const published = await page.request.post("/api/posts/media", { multipart: { content, mediaType: "video", video: { name: "short-hls.mp4", mimeType: "video/mp4", buffer: videoBytes } } });
    expect(published.status()).toBe(201);
    const post = await published.json() as { id: number; mediaAssetId: string };
    execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "scripts/qualify-media-asset.ts", post.mediaAssetId], {
      windowsHide: true, timeout: 30_000, stdio: "pipe",
      env: { ...process.env, CREATOROS_QUALIFICATION_MODE: "true", ASSET_STORAGE_PROVIDER: "local" },
    });
    await expect.poll(async () => {
      const response = await page.request.get(`/api/media/assets/${post.mediaAssetId}`);
      expect(response.ok()).toBe(true);
      const payload = await response.json() as { renditions: Array<{ manifestType: string; status: string }> };
      return payload.renditions.some((rendition) => rendition.manifestType === "hls" && rendition.status === "ready");
    }, { timeout: 60_000 }).toBe(true);
    const failures: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/api\/media\/playback\/sessions\/[^/]+\/events$/.test(request.url())) {
        const event = request.postDataJSON() as { kind?: string; metadata?: { source?: string } };
        if (event.kind === "error") failures.push(event.metadata?.source ?? "unknown");
      }
    });
    await page.goto("/");
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    const descriptorPromise = page.waitForResponse((response) => response.url().endsWith("/api/media/playback/sessions") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Open video" }).first().click();
    const descriptorResponse = await descriptorPromise;
    expect(descriptorResponse.ok()).toBe(true);
    const descriptor = await descriptorResponse.json();
    expect(descriptor.asset.id).toBe(post.mediaAssetId);
    expect(descriptor.rendition.manifestType).toBe("hls");
    const video = page.getByRole("dialog").locator("video");
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, loaded: element.readyState >= 2, adaptive: element.currentSrc.startsWith("blob:") }))).toEqual({ width: 32, loaded: true, adaptive: true });
    await page.getByRole("button", { name: "Play video" }).first().click();
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.ended)).toBe(true);
    const playback = await video.evaluate((element: HTMLVideoElement) => ({ currentTime: element.currentTime, duration: element.duration, srcIsAdaptive: element.currentSrc.startsWith("blob:"), error: element.error?.code ?? null }));
    expect(playback.srcIsAdaptive).toBe(true);
    expect(playback.error).toBeNull();
    expect(playback.duration).toBeCloseTo(frames / 10, 1);
    expect(failures).toEqual([]);
    await page.screenshot({ path: info.outputPath("short-hls-player.png") });
    writeFileSync(info.outputPath("short-hls-receipt.json"), JSON.stringify({ frames, rendition: "hls", progressiveFallback: false, playback, telemetryErrors: failures }, null, 2));
  });
}
