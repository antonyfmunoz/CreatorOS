import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { waitForCutRender } from "./helpers/cut-render";

test("native text layout preserves wrapped lines and authoring controls in private video", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("native-text");
  mkdirSync(directory, { recursive: true });
  const source = `${directory}/blue.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source]);
  const uploaded = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  const asset = (await uploaded.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Native wrapped typography", duration: 1, mediaKind: "video" } });
  expect(created.ok()).toBeTruthy();
  const project = await created.json();
  const title = "ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT\nGOLF HOTEL INDIA";
  const saved = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: "Wrapped type", manifest: { version: 1, name: "Wrapped type", width: 1280, height: 720, fps: 30, durationInFrames: 30, layers: [
    { id: "video", kind: "video", name: "Source", assetId: asset.id, from: 0, durationInFrames: 30 },
    { id: "title", kind: "text", name: "Paragraph", text: title, from: 0, durationInFrames: 30, x: .1, y: .1, width: .8, height: .6, style: { fontSize: 72, color: "#ffffff", backgroundColor: "#123456", backgroundOpacity: .25 } },
  ] } } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const composition = await saved.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const studio = page.getByLabel("CutStudio creative runtime");
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("title");
  await studio.getByLabel("Layer content", { exact: true }).fill(title);
  await expect(studio.locator('[data-composition-fonts="ready"]')).toHaveCount(1);
  await studio.getByLabel("Text alignment", { exact: true }).selectOption("center");
  await studio.getByLabel("Text vertical alignment").selectOption("middle");
  await studio.getByLabel("Line height", { exact: true }).fill("1.6");
  await studio.getByLabel("Letter spacing", { exact: true }).fill("1.2");
  await studio.getByLabel("Horizontal padding").fill("20");
  await studio.getByLabel("Text font weight").selectOption("600");
  const saveResponse = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/compositions/${composition.id}`));
  await studio.getByRole("button", { name: "Save composition", exact: true }).click();
  expect((await saveResponse).ok()).toBeTruthy();
  const previewText = studio.locator('[data-layer-id="title"] [data-native-text-content]');
  await expect(previewText).toHaveCSS("text-align", "center");
  await expect(previewText).toHaveCSS("font-weight", "600");
  await expect(previewText).toHaveCSS("white-space", "pre-wrap");
  const previewLines = await previewText.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    return new Set([...range.getClientRects()].filter((rect) => rect.width > .1).map((rect) => Math.round(rect.top * 10) / 10)).size;
  });
  expect(previewLines).toBe(3);
  await page.reload();
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("title");
  await expect(studio.getByLabel("Text alignment", { exact: true })).toHaveValue("center");
  await expect(studio.getByLabel("Line height", { exact: true })).toHaveValue("1.6");
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { "If-Match": String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  expect((await applied.json()).edl.graphics[0].textLayout).toMatchObject({ align: "center", verticalAlign: "middle", fontWeight: 600, lineHeight: 1.6 });
  const queued = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(queued.ok(), await queued.text()).toBeTruthy();
  const job = await queued.json();
  await waitForCutRender(page.request, job.id, info);
  const completed = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json();
  expect(completed, completed.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String) });
  const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=0`);
  expect(still.ok()).toBeTruthy();
  await info.attach("encoded-native-text", { body: await still.body(), contentType: "image/png" });
  const { data, info: image } = await sharp(await still.body()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(image).toMatchObject({ width: 1280, height: 720 });
  const bands: Array<{ top: number; bottom: number; left: number; right: number }> = [];
  for (let y = 72; y < 504; y++) {
    const xs: number[] = [];
    for (let x = 128; x < 1152; x++) { const i = (y * 1280 + x) * 3; if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) xs.push(x); }
    if (!xs.length) continue;
    let band = bands.at(-1);
    if (!band || y - band.bottom > 3) { band = { top: y, bottom: y, left: 1280, right: 0 }; bands.push(band); }
    band.bottom = y; band.left = Math.min(band.left, ...xs); band.right = Math.max(band.right, ...xs);
  }
  expect(bands).toHaveLength(previewLines);
  for (const band of bands) expect(Math.abs((band.left + band.right) / 2 - 640)).toBeLessThan(5);
  expect(bands[1].top - bands[0].top).toBeGreaterThan(100);
  const background = (100 * 1280 + 134) * 3;
  expect(data[background]).toBeLessThan(20);
  expect(data[background + 2]).toBeGreaterThan(180);
  const peer = info.project.name.startsWith("mobile") ? 2 : 1;
  expect((await page.request.get(`/api/cut/jobs/${job.id}/still?frame=0`, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);

  const fontUpload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "cut-font", visibility: "private", font: { name: "NotoSans.ttf", mimeType: "font/ttf", buffer: readFileSync("shared/assets/cut-fonts/NotoSans-Variable.ttf") } } });
  expect(fontUpload.ok(), await fontUpload.text()).toBeTruthy();
  const fontAsset = (await fontUpload.json()).asset;
  const registration = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: fontAsset.id, name: "Private Noto", duration: 1, mediaKind: "font" } });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const fontMedia = await registration.json();
  const unusedFontRequests: string[] = [];
  const observeUnusedFont = (request: { url(): string }) => {
    if (request.url().includes(`/api/assets/${fontAsset.id}/`) || request.url().includes(`/media-library/${fontMedia.id}/`)) unusedFontRequests.push(request.url());
  };
  page.on("request", observeUnusedFont);
  await page.reload();
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("title");
  await expect(studio.locator('[data-composition-fonts="ready"]')).toHaveCount(1);
  expect(unusedFontRequests, "Unused private library fonts must not be eagerly downloaded or decoded from JSON descriptors").toEqual([]);
  page.off("request", observeUnusedFont);
  const privateFont = studio.getByLabel("Layer private font", { exact: true });
  const selectedFont = page.waitForResponse((response) => response.url().endsWith(`/api/assets/${fontAsset.id}/stream`));
  await privateFont.selectOption(fontAsset.id);
  const fontResponse = await selectedFont;
  expect(fontResponse.ok()).toBeTruthy();
  expect(fontResponse.headers()["content-type"]).not.toContain("json");
  const privateFamily = `CreativesOS_${fontAsset.id.replaceAll("-", "")}`;
  await expect.poll(() => page.evaluate((family) => [...document.fonts].some((face) => face.family.includes(family) && face.status === "loaded"), privateFamily)).toBe(true);
  const deniedFont = await page.request.get(`/api/assets/${fontAsset.id}/stream`, { headers: { "x-creativesos-demo-user": String(peer) } });
  expect(deniedFont.status()).toBe(403);
  expect(await deniedFont.json()).toEqual({ message: "You do not have access to this private asset" });
  expect(deniedFont.headers()["cache-control"]).toBe("no-store");
  await studio.getByLabel("Text font style", { exact: true }).selectOption("italic");
  await expect(previewText).toHaveCSS("font-style", "italic");
  // Choosing the default must actually detach this layer, without deleting the
  // private font registration that another layer could still be using.
  await privateFont.selectOption("");
  await expect(privateFont).toHaveValue("");
  await expect(previewText).toHaveCSS("font-family", /CutStudio Noto Sans/);
  await privateFont.selectOption(fontAsset.id);
  await studio.getByLabel("Layer content", { exact: true }).fill("IIII");
  await expect(studio.locator('[data-composition-fonts="ready"]')).toHaveCount(1);
  const saveItalic = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/compositions/${composition.id}`));
  await studio.getByRole("button", { name: "Save composition", exact: true }).click();
  expect((await saveItalic).ok()).toBeTruthy();
  await page.reload();
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("title");
  await expect(privateFont).toHaveValue(fontAsset.id);
  await expect(previewText).toHaveCSS("font-style", "italic");
  const currentProject = await page.request.get(`/api/cut/projects/${project.id}`);
  expect(currentProject.ok()).toBeTruthy();
  const applyItalic = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { "If-Match": String((await currentProject.json()).revision) } });
  expect(applyItalic.ok(), await applyItalic.text()).toBeTruthy();
  expect((await applyItalic.json()).edl.graphics[0]).toMatchObject({ fontAssetId: fontAsset.id, textLayout: { fontStyle: "italic", fontFaceStyle: "normal" } });
  const italicQueued = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(italicQueued.ok()).toBeTruthy();
  const italicJob = await italicQueued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${italicJob.id}`)).json()).state, { timeout: 60_000 }).toBe("done");
  const italicStill = await page.request.get(`/api/cut/jobs/${italicJob.id}/still?frame=0`);
  expect(italicStill.ok()).toBeTruthy();
  await info.attach("encoded-private-font-italic", { body: await italicStill.body(), contentType: "image/png" });
  const italicPixels = await sharp(await italicStill.body()).removeAlpha().raw().toBuffer();
  const rows: Array<{ y: number; center: number }> = [];
  for (let y = 72; y < 504; y++) {
    let sum = 0; let count = 0;
    for (let x = 128; x < 1152; x++) { const i = (y * 1280 + x) * 3; if (italicPixels[i] > 220 && italicPixels[i + 1] > 220 && italicPixels[i + 2] > 220) { sum += x; count++; } }
    if (count > 10) rows.push({ y, center: sum / count });
  }
  expect(rows.length).toBeGreaterThan(30);
  const upper = rows[Math.floor(rows.length * .25)].center;
  const lower = rows[Math.floor(rows.length * .75)].center;
  expect(upper - lower, "The decoded private-font strokes must visibly lean right").toBeGreaterThan(3);
});
