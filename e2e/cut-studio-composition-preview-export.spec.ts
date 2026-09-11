import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

function ownerFor(info: TestInfo) { return info.project.name.startsWith("mobile") ? 1 : 2; }
async function request(page: Page, owner: number, method: string, url: string, data?: unknown, headers: Record<string, string> = {}) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(owner), ...headers } });
}
async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

test("declarative composition player and native export agree at an authored nonlinear frame", async ({ page }, info) => {
  test.setTimeout(120_000);
  // This is deliberately an in-between frame for both motion systems. It is
  // not a keyframe or reveal boundary, where sparse export samples can happen
  // to agree with the composition player by accident.
  const frame = 5;
  const owner = ownerFor(info);
  const otherOwner = owner === 1 ? 2 : 1;
  const directory = info.outputPath("composition-preview-export");
  mkdirSync(directory, { recursive: true });

  // A private source is still required for a project and for the native export
  // pipeline. The visual oracle is a deterministic shape over that black
  // source, so browser media timing cannot mask a composition-clock mismatch.
  const sourcePath = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", sourcePath], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
  const uploaded = await page.request.post("/api/assets/upload-proxy", {
    headers: { "x-creativesos-demo-user": String(owner) },
    multipart: { kind: "video", visibility: "private", video: { name: "composition-oracle.mp4", mimeType: "video/mp4", buffer: readFileSync(sourcePath) } },
  });
  await expectOk(uploaded);
  const source = (await uploaded.json()).asset;
  const created = await request(page, owner, "POST", "/api/cut/projects", {
    sourceAssetId: source.id,
    name: `Composition preview/export oracle ${Date.now()}`,
    duration: 1,
    mediaKind: "video",
  });
  await expectOk(created);
  const project = await created.json();

  const compositionName = `Nonlinear preview/export ${Date.now()}`;
  const manifest = {
    version: 1,
    name: compositionName,
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 30,
    background: "#000000",
    parameters: [],
    fonts: [],
    metadata: { qualification: "composition-preview-export" },
    layers: [
      {
        id: "source",
        kind: "video",
        name: "Private black source",
        assetId: source.id,
        from: 0,
        durationInFrames: 30,
        sourceStartFrame: 0,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        opacity: 1,
        rotation: 0,
        volume: 0,
        anchorX: .5,
        anchorY: .5,
        rotationX: 0,
        rotationY: 0,
        perspective: 0,
        blendMode: "normal",
        style: {},
        dataBindings: {},
        effects: [],
        animations: [],
      },
      {
        id: "spring-red",
        kind: "shape",
        name: "Spring red proof shape",
        from: 0,
        durationInFrames: 30,
        sourceStartFrame: 0,
        x: .1,
        y: .3,
        width: .25,
        height: .3,
        opacity: 1,
        rotation: 0,
        volume: 1,
        anchorX: .5,
        anchorY: .5,
        rotationX: 0,
        rotationY: 0,
        perspective: 0,
        blendMode: "normal",
        style: { fill: "#ff0000" },
        dataBindings: {},
        effects: [],
        animations: [{
          property: "x",
          keyframes: [
            { frame: 0, value: .1, easing: "linear" },
            { frame: 15, value: .5, easing: "spring" },
            { frame: 29, value: .45, easing: "ease_in_out" },
          ],
        }],
      },
      {
        id: "wipe-green",
        kind: "shape",
        name: "Exact wipe proof shape",
        from: 0,
        durationInFrames: 30,
        sourceStartFrame: 0,
        x: .1,
        y: .05,
        width: .6,
        height: .15,
        opacity: 1,
        rotation: 0,
        volume: 1,
        anchorX: .5,
        anchorY: .5,
        rotationX: 0,
        rotationY: 0,
        perspective: 0,
        blendMode: "normal",
        style: { fill: "#00ff00" },
        dataBindings: {},
        effects: [],
        enter: { kind: "wipe", durationInFrames: 12, easing: "ease_in_out", direction: "left" },
        animations: [],
      },
      {
        id: "data-metric",
        kind: "data",
        name: "Qualified lead metric",
        from: 0,
        durationInFrames: 30,
        sourceStartFrame: 0,
        text: "42 qualified leads",
        x: .05,
        y: .8,
        width: .3,
        height: .1,
        opacity: 1,
        rotation: 0,
        volume: 1,
        anchorX: .5,
        anchorY: .5,
        rotationX: 0,
        rotationY: 0,
        perspective: 0,
        blendMode: "normal",
        style: { color: "#ffffff", backgroundColor: "#1d9bf0", backgroundOpacity: 1, fontSize: 36 },
        dataBindings: {},
        effects: [],
        animations: [],
      },
    ],
  };
  const saved = await request(page, owner, "POST", `/api/cut/projects/${project.id}/compositions`, {
    name: compositionName,
    mode: "declarative",
    manifest,
    codeCapsule: null,
  });
  await expectOk(saved);
  const composition = await saved.json();

  const playerPath = `/api/cut/projects/${project.id}/compositions/${composition.id}/player`;
  const contract = await request(page, owner, "GET", playerPath);
  await expectOk(contract);
  expect((await contract.json()).composition.manifest).toMatchObject({ name: compositionName, layers: expect.arrayContaining([expect.objectContaining({ id: "spring-red" })]) });
  const denied = await request(page, otherOwner, "GET", playerPath);
  expect(denied.status()).toBe(404);

  await page.goto(`/cut-studio?project=${project.id}`);
  const compositionCard = page.getByLabel(`Composition ${compositionName}`, { exact: true });
  await expect(compositionCard).toBeVisible();
  const player = compositionCard.getByLabel("CutStudio composition player", { exact: true });
  await expect(player).toBeVisible();
  await expect(player.getByText("42 qualified leads", { exact: true })).toBeVisible();
  const slider = player.getByLabel("Preview frame", { exact: true });
  await slider.press("Home");
  for (let step = 0; step < frame; step += 1) await slider.press("ArrowRight");
  await expect(player).toHaveAttribute("data-current-frame", String(frame));
  const preview = await player.getByLabel("Composition canvas", { exact: true }).screenshot({ path: `${directory}/preview-frame-${frame}.png` });
  const { data: previewPixels, info: previewImage } = await sharp(preview).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const samplePreview = (x: number, y: number) => {
    const offset = (Math.floor(previewImage.height * y) * previewImage.width + Math.floor(previewImage.width * x)) * previewImage.channels;
    return [...previewPixels.subarray(offset, offset + 3)];
  };
  // The spring has already overshot by frame 5, while the wipe is only partly
  // revealed. These interior samples avoid antialiased edges and independently
  // prove transform/color and geometric-reveal behavior.
  const previewShape = samplePreview(.6, .45);
  const previewWipeVisible = samplePreview(.2, .12);
  const previewWipeHidden = samplePreview(.5, .12);
  // Sample the data card's lower-right interior instead of its text glyphs:
  // browser and native text rasterization deliberately use independent font
  // sessions, so antialiased glyph-edge pixels are not a stable color oracle.
  const previewData = samplePreview(.32, .87);
  const previewBase = samplePreview(.05, .05);
  expect(previewShape[0]).toBeGreaterThan(previewBase[0] + 180);
  expect(previewShape[1]).toBeLessThan(20);
  expect(previewShape[2]).toBeLessThan(20);
  expect(previewWipeVisible[1]).toBeGreaterThan(previewBase[1] + 180);
  expect(previewWipeVisible[0]).toBeLessThan(20);
  expect(previewWipeHidden[1]).toBeLessThan(20);
  expect(previewData[2]).toBeGreaterThan(previewBase[2] + 80);

  const batch = await request(page, owner, "POST", `/api/cut/projects/${project.id}/composition-render-batches`, {
    idempotencyKey: `e2e.composition.preview-export.${crypto.randomUUID()}`,
    compositionIds: [composition.id],
    render: { aspect: "source", captions: false, quality: "draft", resolution: "720p", fps: 30 },
  });
  await expectOk(batch);
  const job = (await batch.json()).jobs[0];
  await waitForCutRender(page.request, job.id, info, { "x-creativesos-demo-user": String(owner) });
  const completed = await request(page, owner, "GET", `/api/cut/jobs/${job.id}`);
  await expectOk(completed);
  expect((await completed.json()).state).toBe("done");
  const output = await downloadCutRender(page.request, job.id, `${directory}/composition-render.mp4`, { "x-creativesos-demo-user": String(owner) });
  const nativeFrame = execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"], { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
  const { data: nativePixels, info: nativeImage } = await sharp(nativeFrame).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sampleNative = (x: number, y: number) => {
    const offset = (Math.floor(nativeImage.height * y) * nativeImage.width + Math.floor(nativeImage.width * x)) * nativeImage.channels;
    return [...nativePixels.subarray(offset, offset + 3)];
  };
  const nativeShape = sampleNative(.6, .45);
  const nativeWipeVisible = sampleNative(.2, .12);
  const nativeWipeHidden = sampleNative(.5, .12);
  const nativeData = sampleNative(.32, .87);
  const nativeBase = sampleNative(.05, .05);
  for (const [name, previewSample, nativeSample] of [["shape", previewShape, nativeShape], ["wipe-visible", previewWipeVisible, nativeWipeVisible], ["wipe-hidden", previewWipeHidden, nativeWipeHidden], ["base", previewBase, nativeBase]] as const) {
    for (let channel = 0; channel < 3; channel += 1) {
      expect(Math.abs(previewSample[channel] - nativeSample[channel]), `${name} frame ${frame} channel ${channel}`).toBeLessThanOrEqual(12);
    }
  }
  for (let channel = 0; channel < 3; channel += 1) expect(Math.abs(previewData[channel] - nativeData[channel]), `data frame ${frame} channel ${channel}`).toBeLessThanOrEqual(12);
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ projectId: project.id, compositionId: composition.id, jobId: job.id, frame, crossOwnerStatus: denied.status(), previewShape, nativeShape, previewWipeVisible, nativeWipeVisible, previewWipeHidden, nativeWipeHidden, previewData, nativeData, previewBase, nativeBase }, null, 2));
});

test("nested static uniform media rotation agrees in the player and native export", async ({ page }, info) => {
  test.setTimeout(120_000);
  const owner = ownerFor(info);
  const directory = info.outputPath("nested-composition-preview-export");
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=30:d=1,drawbox=x=16:y=9:w=48:h=27:color=red:t=fill", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", sourcePath], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
  const uploaded = await page.request.post("/api/assets/upload-proxy", {
    headers: { "x-creativesos-demo-user": String(owner) },
    multipart: { kind: "video", visibility: "private", video: { name: "nested-composition-source.mp4", mimeType: "video/mp4", buffer: readFileSync(sourcePath) } },
  });
  await expectOk(uploaded);
  const source = (await uploaded.json()).asset;
  const created = await request(page, owner, "POST", "/api/cut/projects", {
    sourceAssetId: source.id,
    name: `Nested composition oracle ${Date.now()}`,
    duration: 1,
    mediaKind: "video",
  });
  await expectOk(created);
  const project = await created.json();
  const childName = `Placed child ${Date.now()}`;
  const childManifest = {
    version: 1,
    name: childName,
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 30,
    background: "#000000",
    parameters: [], fonts: [], metadata: { qualification: "nested-composition-preview-export" },
    layers: [{ id: "media", kind: "video", name: "Nested red proof media", assetId: source.id, from: 0, durationInFrames: 30, sourceStartFrame: 0, x: 0, y: 0, width: 1, height: 1, opacity: 1, rotation: 0, volume: 0, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal", style: {}, dataBindings: {}, effects: [], animations: [] }],
  };
  const savedChild = await request(page, owner, "POST", `/api/cut/projects/${project.id}/compositions`, { name: childName, mode: "declarative", manifest: childManifest, codeCapsule: null });
  await expectOk(savedChild);
  const child = await savedChild.json();
  const rootName = `Placed root ${Date.now()}`;
  const rootManifest = {
    version: 1,
    name: rootName,
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 30,
    background: "#000000",
    parameters: [], fonts: [], metadata: { qualification: "nested-composition-preview-export" },
    layers: [{ id: "child", kind: "composition", name: childName, compositionId: child.id, from: 0, durationInFrames: 30, sourceStartFrame: 0, x: .2, y: .2, width: .5, height: .5, opacity: 1, rotation: 90, volume: 1, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal", style: {}, dataBindings: {}, effects: [], animations: [] }],
  };
  const savedRoot = await request(page, owner, "POST", `/api/cut/projects/${project.id}/compositions`, { name: rootName, mode: "declarative", manifest: rootManifest, codeCapsule: null });
  await expectOk(savedRoot);
  const root = await savedRoot.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel(`Composition ${rootName}`, { exact: true }).getByLabel("CutStudio composition player", { exact: true });
  await expect(player).toBeVisible();
  // The nested visual is decoded by a browser media element.  A canvas
  // screenshot taken merely after the player chrome is visible can race the
  // first decoded frame, producing a black oracle on a busy runner.  Qualify
  // the actual preview resource before comparing it with the native render.
  const previewMedia = player.getByLabel("Nested red proof media", { exact: true });
  await expect.poll(async () => previewMedia.evaluate((element) => {
    const media = element as HTMLMediaElement;
    return !media.error && media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }), { timeout: 15_000 }).toBe(true);
  const preview = await player.getByLabel("Composition canvas", { exact: true }).screenshot({ path: `${directory}/preview.png` });
  const previewImage = await sharp(preview).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const previewPixel = (x: number, y: number) => [...previewImage.data.subarray((Math.floor(previewImage.info.height * y) * previewImage.info.width + Math.floor(previewImage.info.width * x)) * previewImage.info.channels, (Math.floor(previewImage.info.height * y) * previewImage.info.width + Math.floor(previewImage.info.width * x)) * previewImage.info.channels + 3)];
  const previewRed = previewPixel(.55, .35);
  const previewBlack = previewPixel(.35, .35);
  expect(previewRed[0]).toBeGreaterThan(180);
  expect(previewRed[1]).toBeLessThan(20);
  expect(previewBlack[0]).toBeLessThan(20);
  const batch = await request(page, owner, "POST", `/api/cut/projects/${project.id}/composition-render-batches`, { idempotencyKey: `e2e.nested.composition.preview-export.${crypto.randomUUID()}`, compositionIds: [root.id], render: { aspect: "source", captions: false, quality: "draft", resolution: "720p", fps: 30 } });
  await expectOk(batch);
  const job = (await batch.json()).jobs[0];
  await waitForCutRender(page.request, job.id, info, { "x-creativesos-demo-user": String(owner) });
  const output = await downloadCutRender(page.request, job.id, `${directory}/nested-composition-render.mp4`, { "x-creativesos-demo-user": String(owner) });
  const native = execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"], { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
  const nativeImage = await sharp(native).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const nativePixel = (x: number, y: number) => [...nativeImage.data.subarray((Math.floor(nativeImage.info.height * y) * nativeImage.info.width + Math.floor(nativeImage.info.width * x)) * nativeImage.info.channels, (Math.floor(nativeImage.info.height * y) * nativeImage.info.width + Math.floor(nativeImage.info.width * x)) * nativeImage.info.channels + 3)];
  const nativeRed = nativePixel(.55, .35);
  const nativeBlack = nativePixel(.35, .35);
  expect(nativeRed[0]).toBeGreaterThan(180);
  expect(nativeRed[1]).toBeLessThan(20);
  expect(nativeBlack[0]).toBeLessThan(20);
  for (const [previewChannel, nativeChannel] of previewRed.map((channel, index) => [channel, nativeRed[index]!] as const)) expect(Math.abs(previewChannel - nativeChannel)).toBeLessThanOrEqual(12);
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ projectId: project.id, childCompositionId: child.id, rootCompositionId: root.id, jobId: job.id, previewRed, previewBlack, nativeRed, nativeBlack }, null, 2));
});

test("animated rotated primary composition media agrees in the player and native export", async ({ page }, info) => {
  test.setTimeout(120_000);
  const owner = ownerFor(info);
  const otherOwner = owner === 1 ? 2 : 1;
  const frame = 5;
  const directory = info.outputPath("animated-primary-composition-preview-export");
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  // A uniform source makes its translated primary rectangle an unambiguous
  // oracle. This specifically exercises the former opaque-V1 export path.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", sourcePath], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
  const uploaded = await page.request.post("/api/assets/upload-proxy", {
    headers: { "x-creativesos-demo-user": String(owner) },
    multipart: { kind: "video", visibility: "private", video: { name: "animated-primary-oracle.mp4", mimeType: "video/mp4", buffer: readFileSync(sourcePath) } },
  });
  await expectOk(uploaded);
  const source = (await uploaded.json()).asset;
  const created = await request(page, owner, "POST", "/api/cut/projects", { sourceAssetId: source.id, name: `Animated primary composition oracle ${Date.now()}`, duration: 1, mediaKind: "video" });
  await expectOk(created);
  const project = await created.json();
  const compositionName = `Animated primary source ${Date.now()}`;
  const manifest = {
    version: 1, name: compositionName, width: 1280, height: 720, fps: 30, durationInFrames: 30, background: "#000000", parameters: [], fonts: [], metadata: { qualification: "animated-primary-composition-preview-export" },
    layers: [{
      id: "primary", kind: "video", name: "Animated red primary media", assetId: source.id, from: 0, durationInFrames: 30, sourceStartFrame: 0,
      x: .05, y: .25, width: .25, height: .5, opacity: 1, rotation: 90, volume: 0, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal", style: {}, dataBindings: {}, effects: [],
      animations: [{ property: "x", keyframes: [{ frame: 0, value: .05, easing: "linear" }, { frame: 15, value: .45, easing: "ease_in_out" }] }],
    }],
  };
  const saved = await request(page, owner, "POST", `/api/cut/projects/${project.id}/compositions`, { name: compositionName, mode: "declarative", manifest, codeCapsule: null });
  await expectOk(saved);
  const composition = await saved.json();
  const denied = await request(page, otherOwner, "GET", `/api/cut/projects/${project.id}/compositions/${composition.id}/player`);
  expect(denied.status()).toBe(404);

  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel(`Composition ${compositionName}`, { exact: true }).getByLabel("CutStudio composition player", { exact: true });
  await expect(player).toBeVisible();
  const media = player.getByLabel("Animated red primary media", { exact: true });
  await expect.poll(async () => media.evaluate((element) => {
    const video = element as HTMLMediaElement;
    return !video.error && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }), { timeout: 15_000 }).toBe(true);
  const slider = player.getByLabel("Preview frame", { exact: true });
  await slider.press("Home");
  for (let step = 0; step < frame; step += 1) await slider.press("ArrowRight");
  await expect(player).toHaveAttribute("data-current-frame", String(frame));
  const preview = await player.getByLabel("Composition canvas", { exact: true }).screenshot({ path: `${directory}/preview-frame-${frame}.png` });
  const previewImage = await sharp(preview).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const previewPixel = (x: number, y: number) => [...previewImage.data.subarray((Math.floor(previewImage.info.height * y) * previewImage.info.width + Math.floor(previewImage.info.width * x)) * previewImage.info.channels, (Math.floor(previewImage.info.height * y) * previewImage.info.width + Math.floor(previewImage.info.width * x)) * previewImage.info.channels + 3)];
  const previewRed = previewPixel(.3, .5);
  const previewBlack = previewPixel(.1, .5);
  expect(previewRed[0]).toBeGreaterThan(180);
  expect(previewRed[1]).toBeLessThan(20);
  expect(previewBlack[0]).toBeLessThan(20);

  const batch = await request(page, owner, "POST", `/api/cut/projects/${project.id}/composition-render-batches`, { idempotencyKey: `e2e.animated.primary.preview-export.${crypto.randomUUID()}`, compositionIds: [composition.id], render: { aspect: "source", captions: false, quality: "draft", resolution: "720p", fps: 30 } });
  await expectOk(batch);
  const job = (await batch.json()).jobs[0];
  await waitForCutRender(page.request, job.id, info, { "x-creativesos-demo-user": String(owner) });
  const output = await downloadCutRender(page.request, job.id, `${directory}/animated-primary-render.mp4`, { "x-creativesos-demo-user": String(owner) });
  const native = execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"], { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
  const nativeImage = await sharp(native).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const nativePixel = (x: number, y: number) => [...nativeImage.data.subarray((Math.floor(nativeImage.info.height * y) * nativeImage.info.width + Math.floor(nativeImage.info.width * x)) * nativeImage.info.channels, (Math.floor(nativeImage.info.height * y) * nativeImage.info.width + Math.floor(nativeImage.info.width * x)) * nativeImage.info.channels + 3)];
  const nativeRed = nativePixel(.3, .5);
  const nativeBlack = nativePixel(.1, .5);
  expect(nativeRed[0]).toBeGreaterThan(180);
  expect(nativeRed[1]).toBeLessThan(20);
  expect(nativeBlack[0]).toBeLessThan(20);
  for (const [name, previewValue, nativeValue] of [["red", previewRed, nativeRed], ["black", previewBlack, nativeBlack]] as const) {
    for (let channel = 0; channel < 3; channel += 1) expect(Math.abs(previewValue[channel] - nativeValue[channel]), `${name} frame ${frame} channel ${channel}`).toBeLessThanOrEqual(12);
  }
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ projectId: project.id, compositionId: composition.id, jobId: job.id, frame, crossOwnerStatus: denied.status(), previewRed, previewBlack, nativeRed, nativeBlack }, null, 2));
});
