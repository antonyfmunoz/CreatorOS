import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

for (const visibility of ["public", "private"] as const) {
  test(`media library plays an actual ${visibility} video through its authorized player`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const directory = mkdtempSync(path.join(tmpdir(), "creativesos-library-video-"));
    let buffer: Buffer;
    try {
      const source = path.join(directory, "source.mp4");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10", "-frames:v", "3", "-c:v", "libx264", "-threads", "1", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
      buffer = readFileSync(source);
    } finally { rmSync(directory, { recursive: true, force: true }); }
    const filename = `library-video-${visibility}-${crypto.randomUUID()}.mp4`;
    const uploaded = await page.request.post("/api/assets/upload-proxy", {
      multipart: { kind: "video", visibility, clientMutationId: crypto.randomUUID(), video: { name: filename, mimeType: "video/mp4", buffer } },
    });
    expect(uploaded.status()).toBe(201);
    const { asset } = await uploaded.json();
    if (visibility === "public") {
      execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "scripts/qualify-media-asset.ts", asset.id], {
        windowsHide: true, timeout: 30_000, stdio: "pipe",
        env: { ...process.env, CREATOROS_QUALIFICATION_MODE: "true", ASSET_STORAGE_PROVIDER: "local" },
      });
    }
    const playbackErrors: string[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && /\/api\/media\/playback\/sessions\/[^/]+\/events$/.test(request.url())) {
        const event = request.postDataJSON() as { kind?: string; metadata?: { source?: string } };
        if (event.kind === "error") playbackErrors.push(event.metadata?.source ?? "unknown");
      }
    });
    await page.goto("/library");
    await page.getByLabel("Search media library").fill(filename);
    const connected = page.waitForResponse(response => response.url().endsWith("/api/media/playback/sessions") && response.request().method() === "POST");
    await page.getByText(filename, { exact: true }).click();
    const descriptorResponse = await connected; expect(descriptorResponse.ok()).toBe(true);
    const descriptor = await descriptorResponse.json();
    expect(descriptor.asset.id).toBe(asset.id);
    expect(descriptor.rendition?.manifestType === "hls").toBe(visibility === "public");
    const video = page.getByLabel("Media library video preview", { exact: true });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, ready: element.readyState >= 2, adaptive: element.currentSrc.startsWith("blob:") }))).toEqual({ width: 32, ready: true, adaptive: visibility === "public" });
    const layout = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const labels = ["Search media library", "Media library video preview", "Remove asset"];
      return { viewport, controls: labels.map(label => {
        const element = document.querySelector(`[aria-label="${label}"]`)!;
        const bounds = element.getBoundingClientRect();
        return { label, left: bounds.left, right: bounds.right, width: bounds.width };
      }) };
    });
    for (const control of layout.controls) {
      expect(control.width, `${control.label} must remain usable`).toBeGreaterThan(0);
      expect(control.left, `${control.label} left edge`).toBeGreaterThanOrEqual(0);
      expect(control.right, `${control.label} right edge`).toBeLessThanOrEqual(layout.viewport + 1);
    }
    // Exercise the actual native media control using a trusted keyboard gesture.
    await video.focus(); await video.press("Space");
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.ended)).toBe(true);
    const playback = await video.evaluate((element: HTMLVideoElement) => ({ currentTime: element.currentTime, duration: element.duration, adaptive: element.currentSrc.startsWith("blob:"), error: element.error?.code ?? null }));
    expect(playback.duration).toBeCloseTo(0.3, 1); expect(playback.error).toBeNull();
    expect(playback.adaptive).toBe(visibility === "public"); expect(playbackErrors).toEqual([]);
    await page.screenshot({ path: info.outputPath("library-video.png") });
    writeFileSync(info.outputPath("library-video.json"), JSON.stringify({ visibility, assetId: asset.id, rendition: descriptor.rendition?.manifestType ?? "progressive", playback, layout }, null, 2));
  });
}

test("media library ignores a previous asset's delayed preview response", async ({ page }) => {
  const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const uploaded: Array<{ id: string; originalFilename: string }> = [];
  for (const index of [1, 2]) {
    const response = await page.request.post("/api/assets/upload-proxy", { multipart: {
      kind: "photo", visibility: "private", clientMutationId: crypto.randomUUID(),
      image: { name: `preview-race-${index}-${crypto.randomUUID()}.png`, mimeType: "image/png", buffer },
    } });
    expect(response.status()).toBe(201); uploaded.push((await response.json()).asset);
  }
  const [first, second] = uploaded;
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  await page.route(`**/api/assets/${first.id}/access`, async route => {
    const original = await route.fetch(); captured(); await held; await route.fulfill({ response: original });
  });
  try {
    await page.goto("/library");
    await page.getByText(first.originalFilename, { exact: true }).click(); await ready;
    await page.getByText(second.originalFilename, { exact: true }).click();
    const preview = page.getByRole("img", { name: second.originalFilename, exact: true });
    await expect(preview).toBeVisible(); const expectedSrc = await preview.getAttribute("src");
    const stale = page.waitForResponse(response => new URL(response.url()).pathname === `/api/assets/${first.id}/access`);
    release(); await stale;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(preview).toHaveAttribute("src", expectedSrc!);
    await expect(page.getByRole("heading", { name: second.originalFilename, exact: true })).toBeVisible();
  } finally { release(); }
});
