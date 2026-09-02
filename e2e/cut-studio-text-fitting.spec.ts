import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { test as base, expect } from "@playwright/test";

const test = base.extend({ extraHTTPHeaders: async ({}, use, info) => {
  await use({ "x-creativesos-demo-user": info.project.name.startsWith("mobile") ? "8" : "9" });
} });

test("automatic text fitting preserves complete headlines and rejects impossible bounds", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("text-fitting"); mkdirSync(directory, { recursive: true });
  const source = `${directory}/blue.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source]);
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Automatic headline fitting", duration: 1, mediaKind: "video" } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const text = "Build creative systems that keep your whole team moving together.";
  const saved = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: "Fitted headline", manifest: { version: 1, name: "Fitted headline", width: 1280, height: 720, fps: 30, durationInFrames: 30, layers: [
    { id: "video", kind: "video", name: "Source", assetId: asset.id, from: 0, durationInFrames: 30 },
    { id: "title", kind: "text", name: "Headline", text, from: 0, durationInFrames: 30, x: .1, y: .1, width: .6, height: .12, style: { fontSize: 120, textAlign: "center", verticalAlign: "middle", color: "#ffffff", backgroundColor: "#123456", backgroundOpacity: .25 } },
  ] } } });
  expect(saved.ok(), await saved.text()).toBeTruthy(); const composition = await saved.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const studio = page.getByLabel("CutStudio creative runtime");
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("title");
  await studio.getByLabel("Fit text to layer", { exact: true }).check();
  await studio.getByLabel("Minimum fitted font size").fill("18");
  await studio.getByLabel("Maximum fitted lines").fill("2");
  const box = studio.locator('[data-layer-id="title"] [data-native-text-box]');
  const content = studio.locator('[data-layer-id="title"] [data-native-text-content]');
  await expect(box).toHaveAttribute("data-text-fit", "fit");
  await expect(content).toHaveText(text);
  const dimensions = await content.evaluate((node) => ({ font: parseFloat(getComputedStyle(node).fontSize), canvas: parseFloat(getComputedStyle(node.closest('[aria-label="Composition canvas"]')!).width), height: parseFloat(getComputedStyle(node).height), line: parseFloat(getComputedStyle(node).lineHeight) }));
  expect(dimensions.font / dimensions.canvas * 1280).toBeGreaterThanOrEqual(18);
  expect(dimensions.font / dimensions.canvas * 1280).toBeLessThan(60);
  expect(dimensions.height / dimensions.line).toBeCloseTo(2, 1);
  const save = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/compositions/${composition.id}`));
  await studio.getByRole("button", { name: "Save composition", exact: true }).click(); expect((await save).ok()).toBeTruthy();
  await page.reload();
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("title");
  await expect(studio.getByLabel("Fit text to layer", { exact: true })).toBeChecked();
  await expect(box).toHaveAttribute("data-text-fit", "fit");
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { "If-Match": String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  expect((await applied.json()).edl.graphics[0].textLayout).toMatchObject({ autoFit: true, minimumFontSize: 18, maxLines: 2 });
  const queued = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(queued.ok()).toBeTruthy(); const job = await queued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).state, { timeout: 60_000 }).toBe("done");
  const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=0`); expect(still.ok()).toBeTruthy();
  await info.attach("fitted-headline", { body: await still.body(), contentType: "image/png" });
  const pixels = await sharp(await still.body()).removeAlpha().raw().toBuffer();
  const bands: number[][] = [];
  for (let y = 72; y < 158; y++) {
    let white = 0;
    for (let x = 128; x < 896; x++) { const i = (y * 1280 + x) * 3; if (pixels[i] > 200 && pixels[i + 1] > 200 && pixels[i + 2] > 200) white++; }
    if (white > 5) { if (!bands.length || y - bands.at(-1)!.at(-1)! > 3) bands.push([]); bands.at(-1)!.push(y); }
  }
  expect(bands).toHaveLength(2);
  expect(bands[0][0]).toBeGreaterThan(75);
  expect(bands[1].at(-1)).toBeLessThan(155);
  await studio.getByLabel("Minimum fitted font size").fill("120");
  await expect(box).toHaveAttribute("data-text-fit", "overflow");
  await expect(studio.getByText("Text does not fit at the minimum size", { exact: true })).toBeVisible();
  const saveOverflow = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/compositions/${composition.id}`));
  await studio.getByRole("button", { name: "Save composition", exact: true }).click(); expect((await saveOverflow).ok()).toBeTruthy();
  const current = await page.request.get(`/api/cut/projects/${project.id}`); expect(current.ok()).toBeTruthy();
  const applyOverflow = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { "If-Match": String((await current.json()).revision) } });
  expect(applyOverflow.ok()).toBeTruthy();
  const overflowQueued = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(overflowQueued.ok()).toBeTruthy(); const overflowJob = await overflowQueued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${overflowJob.id}`)).json()).state, { timeout: 60_000 }).toBe("error");
  const failed = await (await page.request.get(`/api/cut/jobs/${overflowJob.id}`)).json();
  expect(failed.detail).toMatch(/cannot fit/); expect(failed.artifactAssetId).toBeNull();
});
