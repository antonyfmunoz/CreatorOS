import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("audible primary preview follows track gain and mute without reloading media", async ({ page }, info) => {
  const dir = info.outputPath("preview-mix"); mkdirSync(dir, { recursive: true });
  const file = `${dir}/tone.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=12", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=12", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", file]);
  const decoded = execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", file, "-t", "1", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
  let energy = 0;
  for (let offset = 0; offset < decoded.length; offset += 4) energy += decoded.readFloatLE(offset) ** 2;
  const sourceDbfs = 10 * Math.log10(energy / (decoded.length / 4));
  expect(sourceDbfs).toBeGreaterThan(-22); expect(sourceDbfs).toBeLessThan(-20);
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "tone.mp4", mimeType: "video/mp4", buffer: readFileSync(file) } } });
  expect(upload.ok()).toBeTruthy(); const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Audible primary preview", duration: 12, mediaKind: "video" } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const video = page.getByLabel("Timeline monitor").locator("video");
  await video.evaluate(async (element: HTMLVideoElement) => { element.loop = true; element.muted = false; element.volume = 1; await element.play(); });
  const level = async () => Number.parseFloat((await page.getByLabel("Live RMS level").textContent()) ?? "-60");
  // The analyser starts with a partly silent window. A first reading above
  // -30 dBFS can still be -25.1 while this decoded tone settles near -21.
  // Require the actual source level before retaining a comparison baseline;
  // this adds a calibration check without relaxing the 10–14 dB gain bounds.
  await expect.poll(level, { timeout: 10_000 }).toBeGreaterThan(sourceDbfs - 1);
  await expect.poll(level).toBeLessThan(sourceDbfs + 1);
  const baseline = await level();
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  await gain.press("Home"); for (let n = 0; n < 5; n++) await gain.press("ArrowRight");
  await expect(gain).toHaveValue("0.25");
  await expect.poll(async () => baseline - await level()).toBeGreaterThan(10);
  await expect.poll(async () => baseline - await level()).toBeLessThan(14);
  const quiet = await level();
  await page.getByRole("button", { name: "Mute V1 track", exact: true }).click();
  await expect.poll(level).toBeLessThan(-55);
  await page.getByRole("button", { name: "Unmute V1 track", exact: true }).click();
  await expect.poll(level).toBeGreaterThan(quiet - 2);
  await expect.poll(level).toBeLessThan(quiet + 2);
  await info.attach("audible-preview-gain", { body: JSON.stringify({ decodedSourceDbfs: sourceDbfs, baselineDbfs: baseline, quarterGainDbfs: quiet, restoredDbfs: await level() }), contentType: "application/json" });
});
