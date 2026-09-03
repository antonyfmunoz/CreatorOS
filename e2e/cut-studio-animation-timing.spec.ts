import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { renderCutAnimationFrames } from "../server/cut-animation-renderer";
import { createCutNativeBrowserSession } from "../server/cut-native-browser-session";
import { waitForCutRender } from "./helpers/cut-render";

function rescaleAnimation(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rescaleAnimation);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === "number" && ["ip", "op", "t"].includes(key) ? item * 2 + 20
      : key === "fr" && typeof item === "number" ? item * 2 : rescaleAnimation(item),
  ]));
}

test("native Lottie timing preserves pixels across asset rates, in-points and source offsets", async ({}, info) => {
  const directory = info.outputPath("animation-timing"); mkdirSync(directory, { recursive: true });
  const fixture = path.resolve("tests/fixtures/cut-lottie-basic.json");
  const variant = path.join(directory, "sixty-fps-offset.json");
  writeFileSync(variant, JSON.stringify(rescaleAnimation(JSON.parse(readFileSync(fixture, "utf8")))));
  const session = createCutNativeBrowserSession();
  try {
    const input = { kind: "lottie" as const, width: 128, height: 128, fps: 30, duration: .1, sourceStartSeconds: 5 / 30, session };
    const baseline = await renderCutAnimationFrames({ ...input, sourcePath: fixture, outputDirectory: path.join(directory, "baseline") });
    const alternate = await renderCutAnimationFrames({ ...input, sourcePath: variant, outputDirectory: path.join(directory, "alternate") });
    expect(baseline.frameCount).toBe(3); expect(alternate.frameCount).toBe(3);
    for (let frame = 0; frame < 3; frame++) {
      const name = `frame-${String(frame).padStart(6, "0")}.png`;
      const a = await sharp(path.join(directory, "baseline", name)).ensureAlpha().raw().toBuffer();
      const b = await sharp(path.join(directory, "alternate", name)).ensureAlpha().raw().toBuffer();
      expect(a.equals(b), `exact decoded pixels at output frame ${frame}`).toBe(true);
    }
    writeFileSync(path.join(directory, "receipt.json"), JSON.stringify({ frames: 3, decodedPixelsExact: true, sourceFrameRates: [30, 60], inPoints: [0, 20], sourceStartSeconds: 5 / 30 }));
  } finally { await session.close(); }
});

test("authored animation offsets survive reload and match preview and private export", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("animation-offset-workflow"); mkdirSync(directory, { recursive: true });
  const source = path.join(directory, "blue.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source]);
  const json = async (response: Awaited<ReturnType<typeof page.request.get>>) => { expect(response.ok(), await response.text()).toBeTruthy(); return response.json(); };
  const uploaded = await json(await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } }));
  const project = await json(await page.request.post("/api/cut/projects", { data: { sourceAssetId: uploaded.asset.id, name: "Animation timing workflow", duration: 1, mediaKind: "video" } }));
  const animationData = rescaleAnimation(JSON.parse(readFileSync(path.resolve("tests/fixtures/cut-lottie-basic.json"), "utf8")));
  const animationUpload = await json(await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "cut-lottie", visibility: "private", lottie: { name: "sixty-fps-offset.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(animationData)) } } }));
  await json(await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: animationUpload.asset.id, name: "Offset animation", duration: 2, mediaKind: "lottie" } }));
  const composition = await json(await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: "Animation clock", manifest: { version: 1, name: "Animation clock", width: 1280, height: 720, fps: 30, durationInFrames: 30, layers: [
    { id: "source", name: "Source", kind: "video", assetId: uploaded.asset.id, from: 0, durationInFrames: 30 },
    { id: "animation", name: "Offset animation", kind: "lottie", assetId: animationUpload.asset.id, from: 0, durationInFrames: 30, sourceStartFrame: 0, x: .1, y: .1, width: .2, height: 256 / 720 },
  ] } } }));
  await page.goto(`/cut-studio?project=${project.id}`);
  const studio = page.getByLabel("CutStudio creative runtime");
  await studio.getByLabel("Selected layer", { exact: true }).selectOption("animation");
  await studio.getByLabel("Layer source start frame", { exact: true }).fill("5");
  const saving = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/compositions/${composition.id}`));
  await studio.getByRole("button", { name: "Save composition", exact: true }).click(); await json(await saving);
  await page.reload(); await studio.getByLabel("Selected layer", { exact: true }).selectOption("animation");
  await expect(studio.getByLabel("Layer source start frame", { exact: true })).toHaveValue("5");
  const transforms = studio.getByLabel("Offset animation Lottie preview", { exact: true }).locator("svg g[transform]");
  await expect.poll(async () => transforms.evaluateAll(nodes => nodes.some(node => {
    const match = /^matrix\(([^)]+)\)$/.exec(node.getAttribute("transform") ?? "");
    if (!match) return false;
    const numbers = match[1].split(/[,\s]+/).map(Number);
    return Math.abs(Math.atan2(numbers[1], numbers[0]) * 180 / Math.PI - 30) < .25;
  })), { message: "Preview must use asset FPS and apply its in-point exactly once" }).toBe(true);
  await page.screenshot({ path: path.join(directory, "preview.png") });
  const applied = await json(await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { "If-Match": String(project.revision) } }));
  expect(applied.edl.graphics[0].animationSourceStartSeconds).toBeCloseTo(5 / 30, 12);
  const job = await json(await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } }));
  await waitForCutRender(page.request, job.id, info);
  const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=0`); expect(still.ok()).toBeTruthy();
  const bytes = await still.body(); writeFileSync(path.join(directory, "export.png"), bytes);
  const actual = await sharp(bytes).extract({ left: 128, top: 72, width: 256, height: 256 }).removeAlpha().raw().toBuffer();
  const expected = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="56" y="56" width="144" height="144" rx="24" fill="white" transform="rotate(30 128 128)"/></svg>')).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  let intersection = 0, union = 0;
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index * 3 + 1] > 90, b = expected[index] > 128;
    if (a && b) intersection++; if (a || b) union++;
  }
  expect(intersection / union, "Exported shape must match an independently drawn 30-degree reference").toBeGreaterThan(.97);
  const peer = info.project.name.startsWith("mobile") ? 2 : 1;
  expect((await page.request.get(`/api/cut/jobs/${job.id}/still?frame=0`, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);
  writeFileSync(path.join(directory, "receipt.json"), JSON.stringify({ sourceStartFrame: 5, compositionFps: 30, assetFps: 60, assetInPoint: 20, previewDegrees: 30, independentGeometryIoU: intersection / union }));
});
