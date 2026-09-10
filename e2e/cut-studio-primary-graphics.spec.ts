import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

test("primary preview animates supported native timeline graphics at the selected output frame", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("primary-graphics"); mkdirSync(directory, { recursive: true });
  const source = `${directory}/graphics-blue.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "graphics-blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(upload.status()).toBe(201); const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Primary graphics", duration: 1, mediaKind: "video" } });
  expect(created.ok()).toBe(true); const project = await created.json();
  const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(project.revision) }, data: { version: 3, clips: [{ id: "primary", start: 0, end: 1, timelineStart: 0 }], graphics: [{ id: "moving-shape", kind: "shape", text: "", timelineStart: 0, duration: 1, x: .1, y: .2, width: .2, height: .2, backgroundColor: "#ff0000", backgroundOpacity: 1, motionKeyframes: [{ at: .5, x: .5, y: .4, scale: 1.5, rotation: 0, rotationX: 0, rotationY: 0, perspective: 0, blur: 0, brightness: 1, saturation: 1, revealKind: null, revealDirection: null, revealProgress: 1, opacity: .5 }] }] } });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.goto(`/cut-studio?project=${project.id}`);
  await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
  const player = page.getByRole("region", { name: "Primary sequence player", exact: true });
  const graphic = player.locator('[data-primary-preview-graphic="moving-shape"]');
  await expect(graphic).toBeVisible();
  expect(await graphic.evaluate((element: HTMLElement) => element.style.left)).toBe("10%");
  const slider = player.getByRole("slider", { name: "Sequence frame", exact: true });
  await slider.press("End");
  await expect(player).toHaveAttribute("data-preview-frame", "29");
  expect(await graphic.evaluate((element: HTMLElement) => element.style.left)).toBe("50%");
  expect(await graphic.evaluate((element: HTMLElement) => element.style.top)).toBe("40%");
  await expect(graphic).toHaveCSS("opacity", "0.5");
  expect(await graphic.evaluate((element: HTMLElement) => element.style.transform)).toContain("scale(1.5)");
  const preview = await player.getByLabel("Primary sequence canvas", { exact: true }).screenshot({ path: `${directory}/graphics-frame-29.png` });
  const { data: previewPixels, info: previewImage } = await sharp(preview).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const samplePreview = (x: number, y: number) => {
    const offset = (Math.floor(previewImage.height * y) * previewImage.width + Math.floor(previewImage.width * x)) * previewImage.channels;
    return [...previewPixels.subarray(offset, offset + 3)];
  };
  const previewShape = samplePreview(.6, .5);
  const previewBase = samplePreview(.05, .05);
  // The keyframe intentionally makes the red shape 50% opaque over the blue
  // source. Verify that compositing took place without mistaking an alpha blend
  // for an opaque primary-red pixel. The native-output comparison below remains
  // the strict preview/render agreement oracle.
  expect(previewShape[0]).toBeGreaterThan(previewBase[0] + 70);
  expect(previewShape[1]).toBeLessThan(15);
  expect(previewShape[2]).toBeLessThan(previewBase[2] - 70);
  const otherOwner = info.project.name.startsWith("mobile") ? "2" : "1";
  const denied = await page.request.get(`/api/cut/projects/${project.id}`, { headers: { "x-creativesos-demo-user": otherOwner } });
  expect(denied.status()).toBe(404);
  await page.getByRole("button", { name: "Close sequence", exact: true }).click();
  const submitted = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
  expect(submitted.status()).toBe(202); const job = await submitted.json(); await waitForCutRender(page.request, job.id, info);
  const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(finished.state).toBe("done");
  const output = await downloadCutRender(page.request, job.id, `${directory}/render.mp4`);
  const sampleNative = (x: number, y: number) => [...execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-vf", `select=eq(n\\,29),crop=2:2:${Math.floor(1280 * x)}:${Math.floor(720 * y)},scale=1:1,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { windowsHide: true, timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).subarray(0, 3)];
  const nativeShape = sampleNative(.6, .5);
  const nativeBase = sampleNative(.05, .05);
  for (const [name, previewSample, nativeSample] of [["shape", previewShape, nativeShape], ["base", previewBase, nativeBase]] as const) {
    for (let channel = 0; channel < 3; channel++) expect(Math.abs(previewSample[channel] - nativeSample[channel]), `${name} frame 29 channel ${channel}`).toBeLessThanOrEqual(12);
  }
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ projectId: project.id, frame: 29, jobId: job.id, crossOwnerStatus: denied.status(), previewShape, nativeShape, previewBase, nativeBase }, null, 2));
});
