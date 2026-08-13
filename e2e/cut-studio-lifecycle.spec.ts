import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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

async function uploadPrivate(page: Page, owner: number, filePath: string, name: string, mimeType: string, kind: "video" | "audio") {
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
    graphics: [{ id: "launch_title", kind: "lower_third", text: "CreativesOS Launch", timelineStart: 0.4, duration: 1.5, x: 0.08, y: 0.75, fontSize: 34, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0.75 }],
    markers: [{ id: "opening_beat", label: "Opening beat", position: 0.5, kind: "beat", color: "#f43f5e" }],
  };
  const savedResponse = await api(page, owner, "PUT", `/api/cut/projects/${project.id}/edl`, edl, { "If-Match": String(loaded.revision) });
  await expectOk(savedResponse);
  expect(await savedResponse.json()).toMatchObject({ version: 3, clips: expect.arrayContaining([expect.objectContaining({ track: "v1", colorPreset: "cinematic", colorAdjust: expect.objectContaining({ contrast: 1.1 }) }), expect.objectContaining({ track: "v2", assetId: broll.id, groupId: "launch_layers", colorPreset: "vivid", chromaKey: expect.objectContaining({ enabled: true }) }), expect.objectContaining({ track: "a1", assetId: music.id, groupId: "launch_layers", duckUnderVoice: true })]), graphics: [expect.objectContaining({ text: "CreativesOS Launch" })], markers: [expect.objectContaining({ label: "Opening beat", position: 0.5 })] });

  await page.goto("/cut-studio");
  await page.getByText(project.name, { exact: true }).click();
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Snap" })).toHaveAttribute("aria-pressed", "true");
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
  await page.getByRole("button", { name: "Ripple track" }).click();
  await expect(page.getByRole("button", { name: "Ripple track" })).toHaveAttribute("aria-pressed", "true");
  const trimEnd = page.getByLabel("Trim end A1 clip 3");
  const trimBox = await trimEnd.boundingBox();
  expect(trimBox).toBeTruthy();
  await page.mouse.move(trimBox!.x + trimBox!.width / 2, trimBox!.y + trimBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(trimBox!.x + trimBox!.width / 2 - trackBox!.width * .1, trimBox!.y + trimBox!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText("Clip trimmed with track ripple and snapping", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const trimmedResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(trimmedResponse);
  const trimmed = await trimmedResponse.json();
  expect(trimmed.edl.clips.find((item: { id: string }) => item.id === "music").end).toBeCloseTo(1.7, 1);
  expect(trimmed.edl.clips.find((item: { id: string }) => item.id === "music_outro").timelineStart).toBeCloseTo(2.2, 1);
  await page.getByLabel("Trim end A1 clip 4").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Clip out point adjusted with track ripple", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const keyboardTrimResponse = await api(page, owner, "GET", `/api/cut/projects/${project.id}`);
  await expectOk(keyboardTrimResponse);
  expect((await keyboardTrimResponse.json()).edl.clips.find((item: { id: string }) => item.id === "music_outro").end).toBeCloseTo(.4, 2);
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
});
