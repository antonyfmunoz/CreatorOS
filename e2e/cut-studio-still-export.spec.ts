import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test("CutStudio exports exact private finished frames with permission and format enforcement", async ({ page }, info) => {
  test.setTimeout(120_000);
  const owner = info.project.name.startsWith("mobile") ? 1 : 2;
  // Use a dedicated reviewer so mobile requests cannot spend the desktop
  // owner's frame-export allowance (or vice versa).
  const peer = 4;
  const directory = info.outputPath("still-export");
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=640x360:rate=30:duration=2", "-vf", "drawbox=color=blue:t=fill:enable='gte(t,1)'", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", sourcePath]);
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "frame-test.mp4", mimeType: "video/mp4", buffer: readFileSync(sourcePath) } } });
  expect(upload.ok()).toBeTruthy();
  const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: `Frame test ${Date.now()}`, duration: 2, mediaKind: "video" } });
  expect(created.ok()).toBeTruthy();
  const project = await created.json();
  const queued = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(queued.ok()).toBeTruthy();
  const job = await queued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).state, { timeout: 60_000 }).toBe("done");
  const endpoint = `/api/cut/jobs/${job.id}/still`;
  expect((await page.request.get(`${endpoint}?frame=30`, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);
  expect((await page.request.get(`${endpoint}?frame=-1`)).status()).toBe(400);
  expect((await page.request.get(`${endpoint}?frame=999`)).status()).toBe(416);
  expect((await page.request.get(`${endpoint}?frame=0&format=svg`)).status()).toBe(400);
  const descriptor = await (await page.request.get(`/api/cut/jobs/${job.id}/media`)).json();
  const video = await page.request.get(descriptor.url);
  const renderedPath = `${directory}/render.mp4`;
  writeFileSync(renderedPath, await video.body());
  const referencePath = `${directory}/reference.png`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", renderedPath, "-vf", "select=eq(n\\,30)", "-frames:v", "1", referencePath]);
  for (const format of ["png", "jpeg", "webp"]) {
    const still = await page.request.get(`${endpoint}?frame=30&format=${format}`);
    expect(still.ok(), await still.text()).toBeTruthy();
    expect(still.headers()["content-type"]).toContain(`image/${format}`);
    expect(still.headers()["cache-control"]).toContain("no-store");
    expect(still.headers()["x-cut-frame"]).toBe("30");
    expect(still.headers()["x-cut-frame-count"]).toBe("60");
    const bytes = await still.body();
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 1280, height: 720, format: format === "jpeg" ? "jpeg" : format });
    if (format === "png") expect((await sharp(bytes).raw().toBuffer()).equals(await sharp(referencePath).raw().toBuffer())).toBe(true);
  }
  const beforeCut = await page.request.get(`${endpoint}?frame=29`);
  const color = await sharp(await beforeCut.body()).resize(1, 1).removeAlpha().raw().toBuffer();
  expect(color[0]).toBeGreaterThan(200); expect(color[2]).toBeLessThan(40);
  await page.goto(`/cut-studio?project=${project.id}`);
  const panel = page.getByRole("region", { name: "Export rendered frame" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Still frame number").fill("30");
  await panel.getByLabel("Still image format").selectOption("webp");
  const downloaded = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download frame" }).click();
  expect((await downloaded).suggestedFilename()).toContain("frame-30.webp");
  await expect(panel.getByRole("status")).toContainText("No new video render");
  const previewButton = page.getByRole("button", { name: /^Preview rendered video / });
  await previewButton.click();
  const preview = page.getByRole("dialog", { name: "Render preview" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("status")).toContainText("Private video ready");
  expect(await preview.getByLabel("Rendered video preview").evaluate((element) => ({ width: (element as HTMLVideoElement).videoWidth, height: (element as HTMLVideoElement).videoHeight, duration: (element as HTMLVideoElement).duration }))).toEqual({ width: 1280, height: 720, duration: 2 });
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(preview).toBeHidden();
  await page.route(`**/api/cut/jobs/${job.id}/media`, (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Access revoked" }) }));
  await previewButton.click();
  await expect(preview.getByRole("alert")).toContainText("could not be opened");
  await page.unroute(`**/api/cut/jobs/${job.id}/media`);
  await preview.getByRole("button", { name: "Retry preview" }).click();
  await expect(preview.getByRole("status")).toContainText("Private video ready");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const compositionResponse = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: {
    name: "Responsive portrait headline", manifest: { version: 1, name: "Responsive portrait headline", width: 1920, height: 1080, fps: 30, durationInFrames: 60, background: "#000000", layers: [
      { id: "source", kind: "video", name: "Source", from: 0, durationInFrames: 60, assetId: asset.id },
      { id: "headline", kind: "text", name: "Headline", from: 0, durationInFrames: 60, x: .1, y: .4, width: .72, height: .16, text: "Turn attention into momentum", style: { fontSize: 72, color: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0 } },
    ] },
  } });
  expect(compositionResponse.ok(), await compositionResponse.text()).toBeTruthy();
  const composition = await compositionResponse.json();
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { "If-Match": String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  expect((await applied.json()).edl.graphics[0].fontReferenceWidth).toBe(1920);
  const portraitQueued = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "9:16", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(portraitQueued.ok()).toBeTruthy();
  const portraitJob = await portraitQueued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${portraitJob.id}`)).json()).state, { timeout: 60000 }).toBe("done");
  const portraitStill = await page.request.get(`/api/cut/jobs/${portraitJob.id}/still?frame=30`);
  expect(portraitStill.ok()).toBeTruthy();
  const portraitPixels = await sharp(await portraitStill.body()).removeAlpha().raw().toBuffer();
  const corner = (290 * 406 + 50) * 3;
  expect(portraitPixels[corner + 2]).toBeGreaterThan(180);
  expect(portraitPixels[corner]).toBeLessThan(40);
  const whiteY: number[] = [];
  for (let y = 288; y < 404; y++) for (let x = 40; x < 335; x++) {
    const index = (y * 406 + x) * 3;
    if (portraitPixels[index] > 200 && portraitPixels[index + 1] > 200 && portraitPixels[index + 2] > 200) whiteY.push(y);
  }
  expect(whiteY.length).toBeGreaterThan(100);
  expect(Math.max(...whiteY) - Math.min(...whiteY)).toBeLessThan(24);
  await page.reload();
  await page.getByRole("button", { name: /^Preview rendered video / }).first().click();
  await expect(preview.getByRole("status")).toContainText("Private video ready");
  expect(await preview.getByLabel("Rendered video preview").evaluate((element) => ({ width: (element as HTMLVideoElement).videoWidth, height: (element as HTMLVideoElement).videoHeight, duration: (element as HTMLVideoElement).duration }))).toEqual({ width: 406, height: 720, duration: 2 });
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  const grant = await page.request.post(`/api/cut/projects/${project.id}/collaborators`, { data: { username: "buyer", role: "reviewer" } });
  expect(grant.ok()).toBeTruthy();
  expect((await page.request.get(`${endpoint}?frame=30`, { headers: { "x-creativesos-demo-user": String(peer) } })).ok()).toBeTruthy();
  expect((await page.request.delete(`/api/cut/projects/${project.id}/collaborators/${peer}`)).ok()).toBeTruthy();
  expect((await page.request.get(`${endpoint}?frame=30`, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);
});
