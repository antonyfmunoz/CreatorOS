import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("timeline render captures its edit and review even after later changes", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("snapshot"); mkdirSync(directory, { recursive: true });
  const source = `${directory}/blue.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source]);
  const uploaded = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy(); const asset = (await uploaded.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Immutable timeline", duration: 1, mediaKind: "video" } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const saved = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: "Submitted composition", manifest: { version: 1, name: "Submitted composition", width: 640, height: 360, fps: 30, durationInFrames: 30, layers: [{ id: "video", kind: "video", name: "Source", assetId: asset.id, from: 0, durationInFrames: 30 }] } } });
  expect(saved.ok(), await saved.text()).toBeTruthy(); const composition = await saved.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const fullRender = page.getByRole("button", { name: "Render full edit", exact: true });
  await expect(fullRender).toBeEnabled();
  let releaseApply!: () => void;
  const applyGate = new Promise<void>((resolve) => { releaseApply = resolve; });
  await page.route(`**/compositions/${composition.id}/apply`, async (route) => { await applyGate; await route.continue(); });
  try {
    await page.getByLabel("CutStudio creative runtime").getByRole("button", { name: "Apply", exact: true }).click();
    await expect(fullRender).toBeDisabled();
    await expect(page.getByText("Finish applying and saving timeline changes before rendering.", { exact: true })).toBeVisible();
  } finally { releaseApply(); }
  await expect(fullRender).toBeEnabled();
  await page.unroute(`**/compositions/${composition.id}/apply`);
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() === "PUT") await saveGate;
    await route.continue();
  });
  try {
    await page.getByRole("slider", { name: "V1 track gain", exact: true }).press("ArrowLeft");
    await expect(fullRender).toBeDisabled();
  } finally { releaseSave(); }
  await expect(fullRender).toBeEnabled();
  await page.unroute(`**/projects/${project.id}/edl`);
  const current = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(current.revision).toBeGreaterThan(project.revision);
  const stale = await page.request.post(`/api/cut/projects/${project.id}/render`, { headers: { "If-Match": String(project.revision) }, data: {} });
  expect(stale.status()).toBe(409);
  const injected = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { timeline: {} } });
  expect(injected.status()).toBe(400);
  await page.getByLabel("Render resolution").selectOption("720p");
  await page.getByLabel("Render quality").selectOption("draft");
  const submitted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/cut/projects/${project.id}/render`));
  await fullRender.click();
  const response = await submitted; expect(response.ok(), await response.text()).toBeTruthy();
  expect(response.request().headers()["if-match"]).toBe(String(current.revision));
  const job = await response.json();
  expect(job.request.timeline).toMatchObject({ projectId: project.id, sourceAssetId: asset.id, revision: current.revision, edl: current.edl, transcript: null });
  expect(job.request.timeline.sha256).toMatch(/^[a-f0-9]{64}$/);
  const changed = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(current.revision) }, data: { ...current.edl, clips: current.edl.clips.map((clip: any) => ({ ...clip, volume: .2, end: .5 })) } });
  expect(changed.ok(), await changed.text()).toBeTruthy();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).state, { timeout: 60_000 }).toBe("done");
  const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json();
  expect(finished.output).toMatchObject({ timelineRevision: current.revision, timelineSha256: job.request.timeline.sha256, timelineSnapshot: "captured", duration: 1 });
  const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=20`); expect(still.ok()).toBeTruthy();
  await info.attach("submitted-timeline-frame-20", { body: await still.body(), contentType: "image/png" });
  const reviewResponse = await page.request.post(`/api/cut/projects/${project.id}/reviews`, { data: { jobId: job.id, label: "Submitted timeline", expiresDays: 1 } });
  expect(reviewResponse.ok(), await reviewResponse.text()).toBeTruthy();
  // The review payload, not the current edit, must match the rendered timeline.
  const reviewCreated = await reviewResponse.json();
  expect(reviewCreated.version.edl).toEqual(job.request.timeline.edl);
  expect(reviewCreated.version.revision).toBe(current.revision);
  const token = new URL(reviewCreated.reviewUrl).pathname.split("/").at(-1)!;
  const publicReview = await page.request.get(`/api/cut/reviews/${token}`); expect(publicReview.ok()).toBeTruthy();
  const review = await publicReview.json();
  expect(review.version.revision).toBe(current.revision);
});
