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
  const grant = await page.request.post(`/api/cut/projects/${project.id}/collaborators`, { data: { username: "buyer", role: "reviewer" } });
  expect(grant.ok()).toBeTruthy();
  expect((await page.request.get(`${endpoint}?frame=30`, { headers: { "x-creativesos-demo-user": String(peer) } })).ok()).toBeTruthy();
  expect((await page.request.delete(`/api/cut/projects/${project.id}/collaborators/${peer}`)).ok()).toBeTruthy();
  expect((await page.request.get(`${endpoint}?frame=30`, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);
});
