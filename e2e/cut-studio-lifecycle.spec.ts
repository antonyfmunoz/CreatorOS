import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function ownerFor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

async function api(page: Page, owner: number, method: string, url: string, data?: unknown, extraHeaders: Record<string, string> = {}) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(owner), ...extraHeaders } });
}

async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

function generateFixtures(testInfo: TestInfo) {
  const directory = testInfo.outputPath("cut-studio-fixtures");
  mkdirSync(directory, { recursive: true });
  const primary = `${directory}/primary.mp4`;
  const broll = `${directory}/broll.mp4`;
  const music = `${directory}/music.mp3`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", primary]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x1d9bf0:size=320x180:rate=24:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", broll]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2", "-c:a", "libmp3lame", music]);
  return { primary, broll, music };
}

async function uploadPrivate(page: Page, owner: number, filePath: string, name: string, mimeType: string, kind: "video" | "audio" | "cut-lut") {
  const response = await page.request.post("/api/assets/upload-proxy", {
    headers: { "x-creativesos-demo-user": String(owner) },
    multipart: {
      kind,
      visibility: "private",
      [kind]: { name, mimeType, buffer: readFileSync(filePath) },
    },
  });
  await expectOk(response);
  return (await response.json()).asset as { id: string };
}

test("CutStudio validates and renders a private cube LUT", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const directory = testInfo.outputPath("cube-lut-fixtures");
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/red-source.mp4`;
  const lutPath = `${directory}/green-transform.cube`;
  const outputPath = `${directory}/lut-output.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=640x360:rate=24:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", sourcePath]);
  writeFileSync(lutPath, `TITLE "Green transform"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n${Array.from({ length: 8 }, () => "0 1 0").join("\n")}\n`);
  const source = await uploadPrivate(page, owner, sourcePath, "red-source.mp4", "video/mp4", "video");
  const lut = await uploadPrivate(page, owner, lutPath, "green-transform.cube", "text/plain", "cut-lut");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: source.id, name: `Private LUT ${Date.now()}`, duration: 1, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  const registerResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/luts`, { assetId: lut.id, name: "Green transform.cube" });
  await expectOk(registerResponse);
  expect((await api(page, peer, "POST", `/api/cut/projects/${project.id}/luts`, { assetId: lut.id, name: "Stolen.cube" })).status()).toBe(404);
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  expect(loaded.luts).toEqual(expect.arrayContaining([expect.objectContaining({ id: lut.id, name: "Green transform.cube" })]));
  const savedResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, { ...loaded.edl, clips: loaded.edl.clips.map((clip: Record<string, unknown>) => ({ ...clip, lutAssetId: lut.id })) }, { "If-Match": String(loaded.revision) });
  await expectOk(savedResponse);
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const job = await jobResponse.json();
  expect(job, job.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String) });
  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "LUT qualification", expiresDays: 1 });
  await expectOk(reviewResponse);
  const token = new URL((await reviewResponse.json()).reviewUrl).pathname.split("/").at(-1)!;
  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${token}`);
  await expectOk(publicReviewResponse);
  const artifactResponse = await page.request.get((await publicReviewResponse.json()).media.url);
  await expectOk(artifactResponse);
  writeFileSync(outputPath, await artifactResponse.body());
  const pixel = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", outputPath, "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  expect(pixel[1]).toBeGreaterThan(150);
  expect(pixel[0]).toBeLessThan(80);
  expect(pixel[2]).toBeLessThan(80);
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(page.getByLabel("Clip LUT")).toHaveValue(lut.id);
});

test("CutStudio measures calibrated private-source loudness", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const directory = testInfo.outputPath("loudness-fixtures");
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/tone-source.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:size=640x360:rate=24:duration=3", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", sourcePath]);
  const source = await uploadPrivate(page, owner, sourcePath, "tone-source.mp4", "video/mp4", "video");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: source.id, name: `Loudness analysis ${Date.now()}`, duration: 3, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  expect((await api(page, peer, "POST", `/api/cut/projects/${project.id}/audio-analysis`, {})).status()).toBe(404);
  const analysisResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/audio-analysis`, {});
  await expectOk(analysisResponse);
  const analysis = await analysisResponse.json();
  expect(analysis).toMatchObject({ standard: "EBU R128", analyzedSeconds: 3, integratedLufs: expect.any(Number), loudnessRangeLu: expect.any(Number), truePeakDbfs: expect.any(Number) });
  expect(analysis.integratedLufs).toBeGreaterThan(-30);
  expect(analysis.integratedLufs).toBeLessThan(-10);
  expect(analysis.truePeakDbfs).toBeGreaterThan(-30);
  expect(analysis.truePeakDbfs).toBeLessThan(0);
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByLabel("Calibrated loudness analysis").getByText("LUFS-I")).toBeVisible();
  await expect(page.getByText(/Measured -?\d+\.\d LUFS/)).toBeVisible();
});

test("CutStudio privately marks and inserts media from a dedicated source monitor", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const fixture = generateFixtures(testInfo);
  const primary = await uploadPrivate(page, owner, fixture.primary, "source-monitor-primary.mp4", "video/mp4", "video");
  const broll = await uploadPrivate(page, owner, fixture.broll, "source-monitor-broll.mp4", "video/mp4", "video");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: primary.id, name: `Source monitor ${Date.now()}`, duration: 3, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  const registeredResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: broll.id, name: "Source B-roll", duration: 1, mediaKind: "video" });
  await expectOk(registeredResponse);
  const registered = await registeredResponse.json();
  expect((await api(page, peer, "GET", `/api/cut/projects/${project.id}/media-library/${registered.id}/media`)).status()).toBe(404);
  const descriptorResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}/media-library/${registered.id}/media`);
  await expectOk(descriptorResponse);
  const privateMediaResponse = await api(page, owner, "GET", (await descriptorResponse.json()).url);
  await expectOk(privateMediaResponse);

  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(page.getByLabel("Timeline monitor")).toBeVisible();
  const timelineVideo = page.getByLabel("Timeline monitor").locator("video");
  await timelineVideo.evaluate(async (element: HTMLVideoElement) => { element.muted = false; element.volume = .01; await element.play(); });
  await expect.poll(async () => Number((await page.getByLabel("Live short-term loudness").textContent())?.split(" ")[0]), { timeout: 10_000 }).toBeGreaterThan(-70);
  await timelineVideo.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 0; element.dispatchEvent(new Event("timeupdate")); });
  await page.getByLabel("Open Source B-roll in source monitor").click();
  const sourceMonitor = page.getByLabel("Source monitor");
  await expect(sourceMonitor.getByText("Source B-roll")).toBeVisible();
  const sourceVideo = sourceMonitor.locator("video");
  await sourceVideo.evaluate((element: HTMLVideoElement) => { element.currentTime = .25; });
  await sourceMonitor.getByRole("button", { name: "Mark in" }).click();
  await sourceVideo.evaluate((element: HTMLVideoElement) => { element.currentTime = .75; });
  await sourceMonitor.getByRole("button", { name: "Mark out" }).click();
  await sourceMonitor.getByRole("button", { name: "Insert range" }).click();
  await expect(page.getByText(/Source B-roll 0:00–0:00 added to V2 at the playhead/)).toBeVisible();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    return (await response.json()).edl.clips.find((clip: { assetId?: string }) => clip.assetId === broll.id);
  }).toMatchObject({ start: .25, end: .75, timelineStart: 0, track: "v2" });
  await page.reload();
  await expect(page.getByRole("button", { name: /V2 clip/ })).toBeVisible();
});

test("CutStudio renders position keyframes into private multitrack output", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const directory = testInfo.outputPath("motion-keyframe-fixtures");
  mkdirSync(directory, { recursive: true });
  const primaryPath = `${directory}/black-primary.mp4`;
  const overlayPath = `${directory}/red-overlay.mp4`;
  const outputPath = `${directory}/motion-output.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:size=640x360:rate=24:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", primaryPath]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=320x180:rate=24:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", overlayPath]);
  const primary = await uploadPrivate(page, owner, primaryPath, "black-primary.mp4", "video/mp4", "video");
  const overlay = await uploadPrivate(page, owner, overlayPath, "red-overlay.mp4", "video/mp4", "video");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: primary.id, name: `Motion keyframes ${Date.now()}`, duration: 2, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: overlay.id, name: "Red overlay", duration: 2, mediaKind: "video" }));
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  const savedResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, { version: 3, clips: [
    { id: "primary", start: 0, end: 2, track: "v1", timelineStart: 0 },
    { id: "moving_overlay", assetId: overlay.id, start: 0, end: 2, track: "v2", timelineStart: 0, transform: { x: .05, y: .35, width: .2, height: .3, opacity: 1 }, motionKeyframes: [{ at: 1.5, x: .7, y: .35, easing: "ease_in_out" }] },
  ] }, { "If-Match": String(loaded.revision) });
  await expectOk(savedResponse);
  expect(await savedResponse.json()).toMatchObject({ clips: expect.arrayContaining([expect.objectContaining({ id: "moving_overlay", motionKeyframes: [{ at: 1.5, x: .7, y: .35, easing: "ease_in_out" }] })]) });

  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByRole("button", { name: "V2 clip 2" }).click();
  await expect(page.getByLabel("Clip motion keyframes")).toContainText("0:01");
  await page.getByLabel("Clip position X").fill("0.6");
  await page.locator("video").evaluate((element: HTMLVideoElement) => { element.currentTime = 1; element.dispatchEvent(new Event("timeupdate")); });
  await page.getByRole("button", { name: "Add keyframe" }).click();
  await expect(page.getByText("Motion keyframe added at 0:01 inside the clip")).toBeVisible();
  await page.getByLabel("Clip position X").fill("0.05");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await expect.poll(async () => {
    const currentResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(currentResponse);
    return (await currentResponse.json()).edl.clips.find((item: { id: string }) => item.id === "moving_overlay");
  }).toMatchObject({ transform: { x: .05 }, motionKeyframes: expect.arrayContaining([expect.objectContaining({ at: 1, x: .6 }), expect.objectContaining({ at: 1.5, x: .7 })]) });
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const job = await jobResponse.json();
  expect(job, job.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String) });
  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Motion qualification", expiresDays: 1 });
  await expectOk(reviewResponse);
  const token = new URL((await reviewResponse.json()).reviewUrl).pathname.split("/").at(-1)!;
  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${token}`);
  await expectOk(publicReviewResponse);
  const artifactResponse = await page.request.get((await publicReviewResponse.json()).media.url);
  await expectOk(artifactResponse);
  writeFileSync(outputPath, await artifactResponse.body());
  const sample = (seconds: number, x: number) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", outputPath, "-vf", `crop=2:2:${x}:300,scale=1:1`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  const opening = sample(.2, 300);
  const closing = sample(1.8, 930);
  expect(opening[0]).toBeGreaterThan(150);
  expect(opening[1]).toBeLessThan(80);
  expect(closing[0]).toBeGreaterThan(150);
  expect(closing[1]).toBeLessThan(80);
  await page.getByLabel("Motion preset").selectOption("slide_left");
  await expect(page.getByText("Slide left motion preset applied")).toBeVisible();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    return (await response.json()).edl.clips.find((item: { id: string }) => item.id === "moving_overlay");
  }).toMatchObject({ transform: { x: .8 }, motionKeyframes: [{ at: 2, x: 0, y: .35, easing: "ease_in_out" }] });
});

test("CutStudio routes named audio buses into a private render", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const directory = testInfo.outputPath("audio-bus-fixtures");
  mkdirSync(directory, { recursive: true });
  const primaryPath = `${directory}/primary.mp4`;
  const musicPath = `${directory}/music.mp3`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:size=640x360:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", primaryPath]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2", "-c:a", "libmp3lame", musicPath]);
  const primary = await uploadPrivate(page, owner, primaryPath, "primary.mp4", "video/mp4", "video");
  const music = await uploadPrivate(page, owner, musicPath, "music.mp3", "audio/mpeg", "audio");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: primary.id, name: `Audio buses ${Date.now()}`, duration: 2, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: music.id, name: "Music", duration: 2, mediaKind: "audio" }));
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  await expectOk(await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, { version: 3, clips: [
    { id: "primary", start: 0, end: 2, track: "v1", timelineStart: 0 },
    { id: "music", assetId: music.id, start: 0, end: 2, track: "a1", timelineStart: 0, volume: 1 },
  ] }, { "If-Match": String(loaded.revision) }));
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByRole("button", { name: "Creator mix preset" }).click();
  await page.getByLabel("A1 audio bus").selectOption("music");
  await page.getByLabel("Music bus name").fill("Launch music");
  await page.getByLabel("Music bus gain").fill("0.35");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    const current = await response.json();
    return { track: current.edl.tracks.find((item: { track: string }) => item.track === "a1"), bus: current.edl.audioBuses.find((item: { id: string }) => item.id === "music") };
  }).toMatchObject({ track: { bus: "music" }, bus: { name: "Launch music", gain: .35, muted: false } });
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  expect(await jobResponse.json()).toMatchObject({ state: "done", artifactAssetId: expect.any(String), output: { multitrack: true } });
});

test("CutStudio renders scale and opacity keyframes into private output", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const directory = testInfo.outputPath("scale-opacity-fixtures");
  mkdirSync(directory, { recursive: true });
  const primaryPath = `${directory}/black-primary.mp4`;
  const overlayPath = `${directory}/red-overlay.mp4`;
  const outputPath = `${directory}/scale-opacity-output.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:size=640x360:rate=24:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", primaryPath]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=320x180:rate=24:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", overlayPath]);
  const primary = await uploadPrivate(page, owner, primaryPath, "black-primary.mp4", "video/mp4", "video");
  const overlay = await uploadPrivate(page, owner, overlayPath, "red-overlay.mp4", "video/mp4", "video");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: primary.id, name: `Scale opacity ${Date.now()}`, duration: 2, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: overlay.id, name: "Red overlay", duration: 2, mediaKind: "video" }));
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  const savedResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, { version: 3, clips: [
    { id: "primary", start: 0, end: 2, track: "v1", timelineStart: 0 },
    { id: "animated_overlay", assetId: overlay.id, start: 0, end: 2, track: "v2", timelineStart: 0, transform: { x: .1, y: .1, width: .5, height: .6, opacity: .2 }, motionKeyframes: [{ at: 0, x: .1, y: .1, scale: .25, opacity: .2 }, { at: 1.5, x: .1, y: .1, scale: 1, opacity: 1, easing: "ease_in_out" }] },
  ] }, { "If-Match": String(loaded.revision) });
  await expectOk(savedResponse);
  expect(await savedResponse.json()).toMatchObject({ clips: expect.arrayContaining([expect.objectContaining({ id: "animated_overlay", motionKeyframes: [expect.objectContaining({ scale: .25 }), expect.objectContaining({ scale: 1, opacity: 1 })] })]) });
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByRole("button", { name: "V2 clip 2" }).click();
  await expect(page.getByLabel("Clip motion keyframes")).toContainText("Scale 100 · O 100");
  await page.getByLabel("Motion preset").selectOption("zoom_in");
  await expect(page.getByText("Zoom in motion preset applied")).toBeVisible();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    return (await response.json()).edl.clips.find((item: { id: string }) => item.id === "animated_overlay");
  }).toMatchObject({ motionKeyframes: [expect.objectContaining({ scale: .35 }), expect.objectContaining({ scale: 1 })] });
  const currentResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(currentResponse);
  const current = await currentResponse.json();
  await expectOk(await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, { ...current.edl, clips: current.edl.clips.map((item: { id: string }) => item.id === "animated_overlay" ? { ...item, transform: { x: .1, y: .1, width: .5, height: .6, opacity: .2 }, motionKeyframes: [{ at: 0, x: .1, y: .1, scale: .25, opacity: .2 }, { at: 1.5, x: .1, y: .1, scale: 1, opacity: 1, easing: "ease_in_out" }] } : item) }, { "If-Match": String(current.revision) }));
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const job = await jobResponse.json();
  expect(job, job.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String), output: { multitrack: true } });
  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Scale opacity qualification", expiresDays: 1 });
  await expectOk(reviewResponse);
  const token = new URL((await reviewResponse.json()).reviewUrl).pathname.split("/").at(-1)!;
  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${token}`);
  await expectOk(publicReviewResponse);
  const artifactResponse = await page.request.get((await publicReviewResponse.json()).media.url);
  await expectOk(artifactResponse);
  writeFileSync(outputPath, await artifactResponse.body());
  const sample = (seconds: number, x: number, y: number) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", outputPath, "-vf", `crop=2:2:${x}:${y},scale=1:1`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  const openingInside = sample(.15, 180, 100);
  const openingOutside = sample(.15, 500, 300);
  const closingInside = sample(1.8, 500, 300);
  expect(openingInside[0]).toBeGreaterThan(20);
  expect(openingInside[0]).toBeLessThan(100);
  expect(openingOutside[0]).toBeLessThan(20);
  expect(closingInside[0]).toBeGreaterThan(150);
});

test("CutStudio renders clip volume automation into private output", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const directory = testInfo.outputPath("volume-automation-fixtures");
  mkdirSync(directory, { recursive: true });
  const primaryPath = `${directory}/primary.mp4`;
  const musicPath = `${directory}/music.mp3`;
  const outputPath = `${directory}/volume-automation.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=black:size=640x360:rate=24:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", primaryPath]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=3", "-c:a", "libmp3lame", musicPath]);
  const primary = await uploadPrivate(page, owner, primaryPath, "primary.mp4", "video/mp4", "video");
  const music = await uploadPrivate(page, owner, musicPath, "music.mp3", "audio/mpeg", "audio");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: primary.id, name: `Volume automation ${Date.now()}`, duration: 3, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: music.id, name: "Music", duration: 3, mediaKind: "audio" }));
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  await expectOk(await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, { version: 3, clips: [
    { id: "primary", start: 0, end: 3, track: "v1", timelineStart: 0 },
    { id: "music", assetId: music.id, start: 0, end: 3, track: "a1", timelineStart: 0, volume: 1 },
  ] }, { "If-Match": String(loaded.revision) }));
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByRole("button", { name: "A1 clip 2" }).click();
  await page.getByLabel("Volume automation preset").selectOption("duck_middle");
  await expect(page.getByText("Conversation dip volume automation applied")).toBeVisible();
  await expect(page.getByLabel("Clip volume automation")).toContainText("0:01");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    return (await response.json()).edl.clips.find((item: { id: string }) => item.id === "music");
  }).toMatchObject({ volume: 1, volumeKeyframes: [
    { at: .75, volume: 1 }, { at: 1.05, volume: .2, easing: "ease_in_out" }, { at: 1.95, volume: .2 }, { at: 2.25, volume: 1, easing: "ease_in_out" },
  ] });
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const job = await jobResponse.json();
  expect(job, job.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String), output: { multitrack: true } });
  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Volume automation qualification", expiresDays: 1 });
  await expectOk(reviewResponse);
  const token = new URL((await reviewResponse.json()).reviewUrl).pathname.split("/").at(-1)!;
  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${token}`);
  await expectOk(publicReviewResponse);
  const artifactResponse = await page.request.get((await publicReviewResponse.json()).media.url);
  await expectOk(artifactResponse);
  writeFileSync(outputPath, await artifactResponse.body());
  const peakAt = (seconds: number) => {
    const measured = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(seconds), "-t", "0.25", "-i", outputPath, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    expect(measured.status, measured.stderr).toBe(0);
    const peak = Number(measured.stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
    expect(Number.isFinite(peak), measured.stderr).toBeTruthy();
    return peak;
  };
  const openingPeak = peakAt(.2);
  const dippedPeak = peakAt(1.35);
  const closingPeak = peakAt(2.55);
  expect(openingPeak - dippedPeak).toBeGreaterThan(8);
  expect(Math.abs(openingPeak - closingPeak)).toBeLessThan(3);
});

test("CutStudio renders a durable cross dissolve between differently sized sources", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const directory = testInfo.outputPath("cross-dissolve-fixtures");
  mkdirSync(directory, { recursive: true });
  const redPath = `${directory}/red.mp4`;
  const bluePath = `${directory}/blue.mp4`;
  const outputPath = `${directory}/dissolve.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=640x360:rate=24:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", redPath]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=24:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", bluePath]);
  const red = await uploadPrivate(page, owner, redPath, "red.mp4", "video/mp4", "video");
  const blue = await uploadPrivate(page, owner, bluePath, "blue.mp4", "video/mp4", "video");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: red.id, name: `Cross dissolve ${Date.now()}`, duration: 2, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: blue.id, name: "Blue source", duration: 1, mediaKind: "video" }));
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  const savedResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, {
    version: 3,
    clips: [
      { id: "red", label: "Red source", start: 0, end: 1, track: "v1", timelineStart: 0, transition: "cut" },
      { id: "blue", assetId: blue.id, label: "Blue source", start: 0, end: 1, track: "v1", timelineStart: 1, transition: "cross_dissolve" },
    ],
    tracks: [{ track: "v1", locked: false, hidden: false, muted: false, solo: false, gain: 1 }],
  }, { "If-Match": String(loaded.revision) });
  await expectOk(savedResponse);
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const job = await jobResponse.json();
  expect(job, job.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String), output: { multitrack: true } });
  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Dissolve qualification", expiresDays: 1 });
  await expectOk(reviewResponse);
  const review = await reviewResponse.json();
  const reviewToken = new URL(review.reviewUrl).pathname.split("/").at(-1)!;
  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${reviewToken}`);
  await expectOk(publicReviewResponse);
  const artifactResponse = await page.request.get((await publicReviewResponse.json()).media.url);
  await expectOk(artifactResponse);
  writeFileSync(outputPath, await artifactResponse.body());
  const renderedDuration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", outputPath], { encoding: "utf8" }).trim());
  expect(renderedDuration).toBeGreaterThan(1.8);
  expect(renderedDuration).toBeLessThan(2.2);
  const pixel = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "1.175", "-i", outputPath, "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  expect(pixel[0]).toBeGreaterThan(40);
  expect(pixel[2]).toBeGreaterThan(40);
  expect(pixel[1]).toBeLessThan(80);
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByRole("button", { name: "V1 clip 2" }).click();
  await expect(page.getByLabel("Clip transition")).toHaveValue("cross_dissolve");
});

test("CutStudio burns animated word-level captions into the output", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const directory = testInfo.outputPath("kinetic-caption-fixtures");
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/caption-source.mp4`;
  const outputPath = `${directory}/caption-output.mp4`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=640x360:rate=24:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", sourcePath]);
  const source = await uploadPrivate(page, owner, sourcePath, "caption-source.mp4", "video/mp4", "video");
  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", { sourceAssetId: source.id, name: `Kinetic captions ${Date.now()}`, duration: 2, mediaKind: "video" });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  const transcriptResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/transcript`, { duration: 2, language: "en", segments: [{ id: "caption", start: 0.1, end: 1.8, text: "Create better", words: [{ word: "Create", start: 0.1, end: 0.9 }, { word: "better", start: 1, end: 1.8 }] }] }, { "If-Match": String(project.revision) });
  await expectOk(transcriptResponse);
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: true, captionStyle: 4, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${render.id}`)).json()).state, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const job = await jobResponse.json();
  expect(job, job.detail).toMatchObject({ state: "done", artifactAssetId: expect.any(String) });
  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Kinetic caption qualification", expiresDays: 1 });
  await expectOk(reviewResponse);
  const reviewToken = new URL((await reviewResponse.json()).reviewUrl).pathname.split("/").at(-1)!;
  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${reviewToken}`);
  await expectOk(publicReviewResponse);
  const artifactResponse = await page.request.get((await publicReviewResponse.json()).media.url);
  await expectOk(artifactResponse);
  writeFileSync(outputPath, await artifactResponse.body());
  const frame = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", outputPath, "-vf", "scale=640:360", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  let lightPixels = 0;
  for (let index = 0; index < frame.length; index += 3) if (frame[index] > 200 && frame[index + 1] > 200 && frame[index + 2] > 200) lightPixels += 1;
  expect(lightPixels).toBeGreaterThan(100);
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await page.getByLabel("Caption style").selectOption("4");
  await expect(page.getByLabel("Caption style")).toHaveValue("4");
});

test("CutStudio renders an owner-scoped private multitrack artifact", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const fixture = generateFixtures(testInfo);
  const primary = await uploadPrivate(page, owner, fixture.primary, "primary.mp4", "video/mp4", "video");
  const broll = await uploadPrivate(page, owner, fixture.broll, "broll.mp4", "video/mp4", "video");
  const music = await uploadPrivate(page, owner, fixture.music, "music.mp3", "audio/mpeg", "audio");

  const createdResponse = await api(page, owner, "POST", "/api/cut/projects", {
    sourceAssetId: primary.id,
    name: `Multitrack qualification ${Date.now()}`,
    duration: 3,
    mediaKind: "video",
  });
  await expectOk(createdResponse);
  const project = await createdResponse.json();
  expect((await api(page, peer, "GET", `/api/cut/projects/${project.id}`)).status()).toBe(404);

  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: broll.id, name: "Blue B-roll", duration: 1, mediaKind: "video" }));
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/media-library`, { assetId: music.id, name: "Music bed", duration: 2, mediaKind: "audio" }));
  const loadedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(loadedResponse);
  const loaded = await loadedResponse.json();
  expect(loaded.media).toHaveLength(3);
  const musicMedia = loaded.media.find((item: { assetId: string }) => item.assetId === music.id);
  expect(musicMedia).toBeTruthy();
  const waveformResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}/media-library/${musicMedia.id}/waveform`);
  await expectOk(waveformResponse);
  expect(waveformResponse.headers()["content-type"]).toContain("image/png");
  expect(Array.from((await waveformResponse.body()).subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect((await api(page, peer, "GET", `/api/cut/projects/${project.id}/media-library/${musicMedia.id}/waveform`)).status()).toBe(404);

  const edl = {
    version: 3,
    clips: [
      { id: "primary", label: "Primary", start: 0, end: 3, speed: 1, volume: 1, transition: "fade_black", colorPreset: "cinematic", colorAdjust: { brightness: 0.05, contrast: 1.1, saturation: 1.05, temperature: 0.2 }, track: "v1", timelineStart: 0 },
      { id: "broll", assetId: broll.id, label: "Blue B-roll", start: 0, end: 1, speed: 1, volume: 1, colorPreset: "vivid", chromaKey: { enabled: true, color: "#1d9bf0", similarity: 0.2, blend: 0.05 }, track: "v2", timelineStart: 0.5, groupId: "launch_layers", transform: { x: 0.62, y: 0.62, width: 0.35, height: 0.35, opacity: 0.9 } },
      { id: "music", assetId: music.id, label: "Music bed", start: 0, end: 2, speed: 1, volume: 0.2, track: "a1", timelineStart: 0.25, groupId: "launch_layers", duckUnderVoice: true },
      { id: "music_outro", assetId: music.id, label: "Music outro", start: 0, end: 0.5, speed: 1, volume: 0.2, track: "a1", timelineStart: 2.5 },
    ],
    graphics: [{ id: "launch_title", kind: "lower_third", text: "CreativesOS Launch", timelineStart: 0.4, duration: 1.5, x: 0.08, y: 0.75, fontSize: 34, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0.75 }, { id: "outro_title", kind: "title", text: "Next", timelineStart: 2.5, duration: 0.25, x: 0.1, y: 0.2, fontSize: 24, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0.5 }],
    markers: [{ id: "opening_beat", label: "Opening beat", position: 0.5, kind: "beat", color: "#f43f5e" }, { id: "outro_beat", label: "Outro beat", position: 2.5, kind: "beat", color: "#1d9bf0" }],
    tracks: [{ track: "v1", locked: false, hidden: false, muted: false, solo: false, gain: 1 }, { track: "v2", locked: false, hidden: false, muted: false, solo: false, gain: 1 }, { track: "a1", locked: false, hidden: false, muted: false, solo: false, gain: 1 }],
  };
  const savedResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, edl, { "If-Match": String(loaded.revision) });
  await expectOk(savedResponse);
  expect(await savedResponse.json()).toMatchObject({ version: 3, clips: expect.arrayContaining([expect.objectContaining({ track: "v1", colorPreset: "cinematic", colorAdjust: expect.objectContaining({ contrast: 1.1 }) }), expect.objectContaining({ track: "v2", assetId: broll.id, groupId: "launch_layers", colorPreset: "vivid", chromaKey: expect.objectContaining({ enabled: true }) }), expect.objectContaining({ track: "a1", assetId: music.id, groupId: "launch_layers", duckUnderVoice: true })]), graphics: expect.arrayContaining([expect.objectContaining({ text: "CreativesOS Launch" })]), markers: expect.arrayContaining([expect.objectContaining({ label: "Opening beat", position: 0.5 })]) });
  const transcriptResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/transcript`, { duration: 3, language: "en", segments: [
    { id: "hook", start: 0.1, end: 1.2, text: "Start with the hook", words: [{ word: "Start", start: 0.1, end: 0.4 }, { word: "hook", start: 0.8, end: 1.2 }] },
    { id: "close", start: 1.2, end: 2.8, text: "Close with the action", words: [{ word: "Close", start: 1.2, end: 1.6 }, { word: "action", start: 2.3, end: 2.8 }] },
  ] }, { "If-Match": savedResponse.headers()["x-edl-rev"] });
  await expectOk(transcriptResponse);

  await page.goto("/cut-studio");
  await page.getByText(project.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Snap" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Lock V2 track" }).click();
  await expect(page.getByRole("button", { name: "Unlock V2 track" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide V2 track" }).click();
  await expect(page.getByRole("button", { name: "Show V2 track" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mute A1 track" }).click();
  await expect(page.getByRole("button", { name: "Unmute A1 track" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Solo A1 track" }).click();
  await page.getByLabel("A1 track gain").fill("0.5");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    const current = await response.json();
    return current.edl.tracks.find((track: { track: string }) => track.track === "a1");
  }).toMatchObject({ muted: true, solo: true, gain: .5 });
  const trackControlResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(trackControlResponse);
  expect((await trackControlResponse.json()).edl.tracks).toEqual(expect.arrayContaining([expect.objectContaining({ track: "v2", locked: true, hidden: true }), expect.objectContaining({ track: "a1", muted: true, solo: true, gain: .5 })]));
  await page.getByRole("button", { name: "Unlock V2 track" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show V2 track" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unmute A1 track" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unsolo A1 track" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Creator mix preset" }).click();
  await expect(page.getByText("Creator mix preset routed audio tracks to dialogue, music, and effects buses")).toBeVisible();
  await page.getByLabel("A1 audio bus").selectOption("music");
  await page.getByLabel("Music bus name").fill("Campaign music");
  await page.getByLabel("Music bus gain").fill("0.4");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
    await expectOk(response);
    const current = await response.json();
    return { track: current.edl.tracks.find((item: { track: string }) => item.track === "a1"), bus: current.edl.audioBuses.find((item: { id: string }) => item.id === "music") };
  }).toMatchObject({ track: { bus: "music" }, bus: { name: "Campaign music", gain: .4, muted: false } });
  const audioMeter = page.getByLabel("Realtime audio RMS meter");
  await expect(audioMeter).toBeVisible();
  await page.locator("video").evaluate(async (element: HTMLVideoElement) => { await element.play(); });
  await expect.poll(async () => Number.parseFloat((await audioMeter.locator("output").textContent()) ?? "-60"), { timeout: 5_000 }).toBeGreaterThan(-55);
  await page.locator("video").evaluate((element: HTMLVideoElement) => element.pause());
  const waveform = page.getByTestId("waveform-music");
  await expect(waveform).toBeVisible();
  await expect.poll(() => waveform.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await expect(page.getByLabel("Rename marker at 0:00")).toHaveValue("Opening beat");
  await page.getByRole("button", { name: "V2 clip 2" }).click();
  await page.getByRole("button", { name: "A1 clip 3" }).click({ modifiers: ["Shift"] });
  await expect(page.getByRole("button", { name: "Group", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Ungroup", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Make compound" }).click();
  await expect(page.getByLabel("Rename Compound 1")).toBeVisible();
  await expect(page.getByText("2 clips combined into a durable compound", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const compoundResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(compoundResponse);
  expect((await compoundResponse.json()).edl.compounds).toEqual([expect.objectContaining({ label: "Compound 1", clipIds: ["broll", "music"] })]);
  const audioClip = page.getByRole("button", { name: "A1 clip 3" });
  const audioBox = await audioClip.boundingBox();
  const trackBox = await audioClip.locator("..").boundingBox();
  expect(audioBox).toBeTruthy();
  expect(trackBox).toBeTruthy();
  await page.mouse.move(audioBox!.x + audioBox!.width / 2, audioBox!.y + audioBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(audioBox!.x + audioBox!.width / 2 + trackBox!.width * .1, audioBox!.y + audioBox!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("Clip moved with snapping", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const movedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(movedResponse);
  const moved = await movedResponse.json();
  expect(moved.edl.clips.find((item: { id: string }) => item.id === "music").timelineStart).toBeCloseTo(.5, 2);
  expect(moved.edl.clips.find((item: { id: string }) => item.id === "broll").timelineStart).toBeCloseTo(.75, 2);
  expect(moved.edl.clips.find((item: { id: string }) => item.id === "music_outro").timelineStart).toBeCloseTo(2.5, 2);
  await page.getByRole("button", { name: "Ripple off" }).click();
  await page.getByRole("button", { name: "Ripple track" }).click();
  await expect(page.getByRole("button", { name: "Ripple linked" })).toHaveAttribute("aria-pressed", "true");
  const trimEnd = page.getByLabel("Trim end A1 clip 3");
  const trimBox = await trimEnd.boundingBox();
  expect(trimBox).toBeTruthy();
  await page.mouse.move(trimBox!.x + trimBox!.width / 2, trimBox!.y + trimBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(trimBox!.x + trimBox!.width / 2 - trackBox!.width * .1, trimBox!.y + trimBox!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("Clip trimmed with linked ripple and snapping", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const trimmedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(trimmedResponse);
  const trimmed = await trimmedResponse.json();
  expect(trimmed.edl.clips.find((item: { id: string }) => item.id === "music").end).toBeCloseTo(1.7, 1);
  expect(trimmed.edl.clips.find((item: { id: string }) => item.id === "music_outro").timelineStart).toBeCloseTo(2.2, 1);
  expect(trimmed.edl.graphics.find((item: { id: string }) => item.id === "outro_title").timelineStart).toBeCloseTo(2.2, 1);
  expect(trimmed.edl.markers.find((item: { id: string }) => item.id === "outro_beat").position).toBeCloseTo(2.2, 1);
  await page.getByLabel("Trim end A1 clip 4").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Clip out point adjusted with linked ripple", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const keyboardTrimResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(keyboardTrimResponse);
  expect((await keyboardTrimResponse.json()).edl.clips.find((item: { id: string }) => item.id === "music_outro").end).toBeCloseTo(.4, 2);
  await page.getByRole("button", { name: "Roll edit" }).click();
  await page.getByLabel("Trim end A1 clip 3").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Clip out point adjusted with rolling edit", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const rolledResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(rolledResponse);
  const rolled = await rolledResponse.json();
  expect(rolled.edl.clips.find((item: { id: string }) => item.id === "music").end).toBeCloseTo(1.8, 2);
  expect(rolled.edl.clips.find((item: { id: string }) => item.id === "music_outro").start).toBeCloseTo(.1, 2);
  expect(rolled.edl.clips.find((item: { id: string }) => item.id === "music_outro").timelineStart).toBeCloseTo(2.3, 2);
  await page.getByRole("button", { name: "Slip source forward 0.1 seconds" }).click();
  await expect(page.getByText("Source slipped forward 0.1 seconds without moving the clip", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const slippedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(slippedResponse);
  const slipped = await slippedResponse.json();
  expect(slipped.edl.clips.find((item: { id: string }) => item.id === "music").start).toBeCloseTo(.1, 2);
  expect(slipped.edl.clips.find((item: { id: string }) => item.id === "music").end).toBeCloseTo(1.9, 2);
  expect(slipped.edl.clips.find((item: { id: string }) => item.id === "music").timelineStart).toBeCloseTo(.5, 2);
  await page.getByRole("button", { name: "Marker", exact: true }).click();
  await expect(page.getByLabel("Rename marker at 0:00")).toHaveCount(2);
  await expect(page.getByText("Marker added at 0:00")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: true, audioPreset: "broadcast", masterGainDb: -1, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const render = await renderResponse.json();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
    await expectOk(response);
    return (await response.json()).state;
  }, { timeout: 60_000, intervals: [500, 1000, 1500] }).not.toMatch(/queued|running/);

  const jobResponse = await api(page, owner, "GET", `/api/cut/jobs/${render.id}`);
  await expectOk(jobResponse);
  const completed = await jobResponse.json();
  expect(completed, completed.detail).toMatchObject({
    state: "done",
    artifactAssetId: expect.any(String),
    output: { multitrack: true, resolution: "720p", fps: 24, audioPreset: "broadcast", masterGainDb: -1 },
  });

  const reviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Launch review", expiresDays: 7 });
  await expectOk(reviewResponse);
  const review = await reviewResponse.json();
  expect(review.reviewUrl).toContain("/review/cut/");
  expect(review.link).not.toHaveProperty("tokenHash");
  const reviewToken = new URL(review.reviewUrl).pathname.split("/").at(-1)!;
  expect((await api(page, peer, "GET", `/api/cut/projects/${project.id}/reviews`)).status()).toBe(404);

  const publicReviewResponse = await page.request.get(`/api/cut/reviews/${reviewToken}`);
  await expectOk(publicReviewResponse);
  const publicReview = await publicReviewResponse.json();
  expect(publicReview).toMatchObject({ project: { name: project.name }, version: { reviewStatus: "pending" }, review: { label: "Launch review" }, media: { url: expect.any(String) } });
  const mediaResponse = await page.request.get(publicReview.media.url);
  await expectOk(mediaResponse);
  expect(mediaResponse.headers()["content-type"]).toContain("video/mp4");

  const commentResponse = await page.request.post(`/api/cut/reviews/${reviewToken}/comments`, { data: { authorName: "Client reviewer", body: "Tighten this cut", positionMs: 750 } });
  await expectOk(commentResponse);
  const comment = await commentResponse.json();
  const decisionResponse = await page.request.post(`/api/cut/reviews/${reviewToken}/decision`, { data: { reviewerName: "Client reviewer", decision: "changes_requested", note: "One revision requested" } });
  await expectOk(decisionResponse);
  await page.goto(`/review/cut/${reviewToken}`);
  await expect(page.getByRole("heading", { name: new RegExp(project.name) })).toBeVisible();
  await expect(page.getByText("Tighten this cut")).toBeVisible();
  await expect(page.getByText("changes requested", { exact: true }).first()).toBeVisible();

  const ownerReviewsResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}/reviews`);
  await expectOk(ownerReviewsResponse);
  const ownerReviews = await ownerReviewsResponse.json();
  expect(ownerReviews[0]).toMatchObject({ reviewStatus: "changes_requested", comments: [expect.objectContaining({ id: comment.id, status: "open" })], decisions: [expect.objectContaining({ decision: "changes_requested" })] });
  const secondReviewResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews`, { jobId: render.id, label: "Comparison review", expiresDays: 7 });
  await expectOk(secondReviewResponse);
  const secondReview = await secondReviewResponse.json();
  const comparisonMediaResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}/versions/${secondReview.version.id}/media`);
  await expectOk(comparisonMediaResponse);
  expect(await comparisonMediaResponse.json()).toMatchObject({ url: expect.any(String) });
  expect((await api(page, peer, "GET", `/api/cut/projects/${project.id}/versions/${secondReview.version.id}/media`)).status()).toBe(404);
  const peerUsername = peer === 1 ? "owner" : "sarahmitchell";
  const ownerUsername = owner === 1 ? "owner" : "sarahmitchell";
  const collaboratorResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/collaborators`, { username: peerUsername, role: "reviewer" });
  await expectOk(collaboratorResponse);
  expect(await collaboratorResponse.json()).toMatchObject({ userId: peer, username: peerUsername, role: "reviewer" });
  const sharedWorkspaceResponse = await api(page, peer, "GET", `/api/cut/workspace/projects/${project.id}`);
  await expectOk(sharedWorkspaceResponse);
  expect(await sharedWorkspaceResponse.json()).toMatchObject({ access: { role: "reviewer", canManage: false }, media: { url: expect.any(String) }, participants: expect.arrayContaining([expect.objectContaining({ username: ownerUsername, role: "owner" }), expect.objectContaining({ username: peerUsername, role: "reviewer" })]) });
  const workspaceNoteResponse = await api(page, peer, "POST", `/api/cut/workspace/projects/${project.id}/notes`, { body: `@${ownerUsername} tighten the opening beat`, positionMs: 500 });
  await expectOk(workspaceNoteResponse);
  const workspaceNote = await workspaceNoteResponse.json();
  const ownerNotificationResponse = await api(page, owner, "GET", `/api/users/${owner}/notifications`);
  await expectOk(ownerNotificationResponse);
  expect(await ownerNotificationResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({ type: "mention", sourceType: "cutstudio_workspace_note", sourceId: workspaceNote.id, linkTo: `/cut-studio/workspace/${project.id}` })]));
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/review-comments/${comment.id}/resolve`, {}));
  await expectOk(await api(page, owner, "POST", `/api/cut/projects/${project.id}/reviews/${review.link.id}/revoke`, {}));
  expect((await page.request.get(`/api/cut/reviews/${reviewToken}`)).status()).toBe(404);

  const beforeCancellationResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(beforeCancellationResponse);
  const beforeCancellation = await beforeCancellationResponse.json();
  const longEdl = {
    version: 3,
    clips: Array.from({ length: 20 }, (_, index) => ({ id: `cancel-${index}`, label: `Cancellation segment ${index + 1}`, start: 0, end: 3, speed: 1, volume: 1, track: "v1", timelineStart: index * 3 })),
    graphics: [],
  };
  await expectOk(await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, longEdl, { "If-Match": String(beforeCancellation.revision) }));
  const cancellableResponse = await api(page, owner, "POST", `/api/cut/projects/${project.id}/render`, { aspect: "16:9", captions: false, cleanAudio: false, quality: "master", resolution: "2160p", fps: 60 });
  await expectOk(cancellableResponse);
  const cancellable = await cancellableResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${cancellable.id}`)).json()).state, { timeout: 10_000, intervals: [25, 50, 100] }).toBe("running");
  const cancelResponse = await api(page, owner, "POST", `/api/cut/jobs/${cancellable.id}/cancel`, {});
  await expectOk(cancelResponse);
  expect(await cancelResponse.json()).toMatchObject({ state: "cancelled", detail: "Cancelled by user", artifactAssetId: null });
  await new Promise((resolve) => setTimeout(resolve, 750));
  const cancelledResponse = await api(page, owner, "GET", `/api/cut/jobs/${cancellable.id}`);
  await expectOk(cancelledResponse);
  expect(await cancelledResponse.json()).toMatchObject({ state: "cancelled", artifactAssetId: null });
  expect((await api(page, peer, "POST", `/api/cut/jobs/${cancellable.id}/cancel`, {})).status()).toBe(404);

  await page.goto("/cut-studio");
  await page.getByText(project.name, { exact: true }).click();
  await page.getByLabel("Speaker for segment hook").fill("Host");
  await page.getByLabel("Speaker for segment close").fill("Guest");
  await page.getByRole("button", { name: "Move segment close earlier" }).click();
  await page.getByRole("button", { name: "Apply story order" }).click();
  await expect(page.getByText("Transcript order and speaker labels applied to the timeline", { exact: true })).toBeVisible();
  const storyResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(storyResponse);
  const story = await storyResponse.json();
  expect(story.transcript.segments.map((segment: { id: string; speaker?: string }) => [segment.id, segment.speaker])).toEqual([["close", "Guest"], ["hook", "Host"]]);
  expect(story.edl.clips.slice(0, 2)).toMatchObject([{ id: "story_close_0", timelineStart: 0, start: 1.2, end: 2.8 }, { id: "story_hook_1", start: 0.1, end: 1.2 }]);
  expect(story.edl.clips[1].timelineStart).toBeCloseTo(1.6, 6);
  await page.getByLabel("Select Version 2 for comparison").click();
  await page.getByLabel("Select Version 1 for comparison").click();
  await expect(page.getByLabel("Review version comparison")).toBeVisible();
  await expect(page.getByLabel(/comparison video$/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Play / pause both" })).toBeEnabled();
  await page.context().setExtraHTTPHeaders({ "x-creativesos-demo-user": String(peer) });
  await page.goto(`/cut-studio/workspace/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(page.getByLabel("Workspace review media")).toBeVisible();
  await expect(page.getByText(`@${ownerUsername} tighten the opening beat`)).toBeVisible();
  await page.getByLabel("Workspace note").fill(`@${ownerUsername} second review note`);
  await page.getByRole("button", { name: "Add workspace note" }).click();
  await expect(page.getByText(`@${ownerUsername} second review note`)).toBeVisible();
});
