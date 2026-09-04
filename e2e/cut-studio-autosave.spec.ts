import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { test, expect, type Page, type TestInfo } from "@playwright/test";

async function createProject(page: Page, info: TestInfo, name: string) {
  const dir = info.outputPath(name); mkdirSync(dir, { recursive: true });
  const source = `${dir}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "source.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(upload.ok()).toBeTruthy();
  const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name, duration: 1, mediaKind: "video" } });
  expect(created.ok()).toBeTruthy(); return created.json();
}

test("autosave serializes rapid edits without replacing the newer draft", async ({ page }, info) => {
  const project = await createProject(page, info, "Rapid-edit custody");
  await page.goto(`/cut-studio?project=${project.id}`);
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  const render = page.getByRole("button", { name: "Render full edit", exact: true });
  await expect(render).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requests: Array<{ revision: string; data: any }> = [];
  let firstCommitted = false;
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    requests.push({ revision: route.request().headers()["if-match"], data: route.request().postDataJSON() });
    const response = await route.fetch();
    if (requests.length === 1) { firstCommitted = true; await gate; }
    await route.fulfill({ response });
  });
  try {
    await gain.press("ArrowLeft");
    await expect.poll(() => firstCommitted).toBe(true);
    await gain.press("ArrowLeft");
    const latestGain = await gain.inputValue();
    // Longer than the 800ms debounce: an incorrect concurrent save would now
    // use a stale revision while the committed first response is held back.
    await page.waitForTimeout(1100);
    expect(requests).toHaveLength(1);
    await expect(render).toBeDisabled();
    release();
    await expect(render).toBeEnabled();
    await expect(gain).toHaveValue(latestGain);
    expect(requests).toHaveLength(2);
    expect(Number(requests[1].revision)).toBe(Number(requests[0].revision) + 1);
    const saved = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
    expect(saved.edl.tracks.find((track: any) => track.track === "v1").gain).toBe(Number(latestGain));
    await page.reload();
    await expect(gain).toHaveValue(latestGain);
  } finally { release(); }
});

test("a prior saved receipt never labels a newer timeline draft as saved", async ({ page }, info) => {
  const project = await createProject(page, info, "Current-draft save receipt");
  await page.goto(`/cut-studio?project=${project.id}`);
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  await gain.press("ArrowLeft");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const baseline = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  let release!: () => void;
  let received = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    received = true;
    await gate; await route.continue();
  });
  await gain.evaluate((element) => {
    const initial = (element as HTMLInputElement).value;
    const observed: string[] = [];
    Object.assign(window, { __cutStaleSaveReceipts: observed });
    new MutationObserver(() => {
      if ((element as HTMLInputElement).value !== initial && [...document.querySelectorAll('[role="status"]')].some((status) => status.textContent === "Saved")) observed.push("Saved while a newer draft is displayed");
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  try {
    await gain.press("ArrowLeft");
    const draft = await gain.inputValue();
    await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
    await expect.poll(() => received).toBe(true);
    await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
    const unchanged = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
    expect(unchanged.revision).toBe(baseline.revision);
    expect(unchanged.edl).toEqual(baseline.edl);
    expect(await page.evaluate(() => (window as unknown as { __cutStaleSaveReceipts: string[] }).__cutStaleSaveReceipts)).toEqual([]);
    release();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const saved = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
    expect(saved.revision).toBe(baseline.revision + 1);
    expect(saved.edl.tracks.find((track: any) => track.track === "v1").gain).toBe(Number(draft));
    await page.reload(); await expect(gain).toHaveValue(draft);
  } finally { release(); }
});

test("failed autosave retains the draft and retries only on request", async ({ page }, info) => {
  const project = await createProject(page, info, "Failed-save custody");
  await page.goto(`/cut-studio?project=${project.id}`);
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  let attempts = 0;
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    if (++attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary synthetic save outage" }) });
    await route.continue();
  });
  await gain.press("ArrowLeft");
  const draftGain = await gain.inputValue();
  const retry = page.getByRole("button", { name: "Retry saving edit", exact: true });
  await expect(retry).toBeVisible();
  await page.waitForTimeout(1100);
  expect(attempts).toBe(1);
  await expect(gain).toHaveValue(draftGain);
  const render = page.getByRole("button", { name: "Render full edit", exact: true });
  await expect(render).toBeDisabled();
  await retry.click();
  await expect(render).toBeEnabled();
  expect(attempts).toBe(2);
  await page.reload(); await expect(gain).toHaveValue(draftGain);
});

test("returning to the saved edit before debounce clears the abandoned saving state", async ({ page }, info) => {
  const project = await createProject(page, info, "Return to saved timeline");
  await page.goto(`/cut-studio?project=${project.id}`);
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  const render = page.getByRole("button", { name: "Render full edit", exact: true });
  await gain.press("ArrowLeft");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const savedValue = await gain.inputValue();
  const before = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  let writes = 0;
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() === "PUT") writes++;
    await route.continue();
  });
  await gain.press("ArrowLeft");
  await expect(render).toBeDisabled();
  await gain.press("ArrowRight");
  await expect(gain).toHaveValue(savedValue);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(render).toBeEnabled();
  // Observe beyond the unchanged 800ms debounce: no abandoned write is allowed.
  await page.waitForTimeout(1100);
  expect(writes).toBe(0);
  const after = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(after.revision).toBe(before.revision); expect(after.edl).toEqual(before.edl);
  await page.reload(); await expect(gain).toHaveValue(savedValue);
  await expect(render).toBeEnabled();
});

test("returning to a prior edit during an in-flight save waits for its compensating save", async ({ page }, info) => {
  const project = await createProject(page, info, "Return during a committed save");
  await page.goto(`/cut-studio?project=${project.id}`);
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  const render = page.getByRole("button", { name: "Render full edit", exact: true });
  await gain.press("ArrowLeft");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const baseline = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  const savedValue = await gain.inputValue();
  let release!: () => void, committed = false, writes = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    const response = await route.fetch();
    if (writes === 1) { committed = true; await gate; }
    await route.fulfill({ response });
  });
  try {
    await gain.press("ArrowLeft"); await expect.poll(() => committed).toBe(true);
    await gain.press("ArrowRight"); await expect(gain).toHaveValue(savedValue);
    await page.waitForTimeout(1100);
    await expect(render).toBeDisabled(); await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
    expect(writes).toBe(1);
    release();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible(); await expect(render).toBeEnabled();
    expect(writes).toBe(2);
    const saved = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
    expect(saved.revision).toBe(baseline.revision + 2); expect(saved.edl).toEqual(baseline.edl);
  } finally { release(); }
});

test("late autosave cannot replace the next project's timeline", async ({ page }, info) => {
  const first = await createProject(page, info, "Earlier project custody");
  const next = await createProject(page, info, "Next project custody");
  for (let index = 1; index <= 4; index++) {
    const response = await page.request.post("/api/cut/projects", {
      data: { sourceAssetId: next.sourceAssetId, name: `Later project custody ${index}`, duration: 1, mediaKind: "video" },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto(`/cut-studio?project=${first.id}`);
  let release!: () => void;
  let committed = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/projects/${first.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch(); committed = true; await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("slider", { name: "V1 track gain", exact: true }).press("ArrowLeft");
    await expect.poll(() => committed).toBe(true);
    page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Leave without saving"); await dialog.accept(); });
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    const nextProjectButton = page.getByRole("button", { name: "Open Next project custody", exact: true });
    await nextProjectButton.scrollIntoViewIfNeeded();
    const hitTarget = await nextProjectButton.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        card: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        hitButton: hit?.closest("button")?.getAttribute("aria-label") ?? null,
        hitTag: hit?.tagName ?? null,
      };
    });
    await info.attach("next-project-card-hit-target", { body: JSON.stringify(hitTarget), contentType: "application/json" });
    expect(hitTarget.hitButton).toBe("Open Next project custody");
    // The preceding center-point assertion is the browser hit test. Playwright's
    // retry scroll can otherwise move a long virtual project grid between its
    // actionability probe and dispatch, so dispatch at that verified real target.
    await nextProjectButton.click({ force: true });
    await expect(page.getByRole("heading", { name: "Next project custody", exact: true })).toBeVisible();
    release();
    await page.waitForTimeout(1100);
    await expect(page.getByRole("slider", { name: "V1 track gain", exact: true })).toHaveValue("1");
    await expect(page.getByRole("button", { name: "Render full edit", exact: true })).toBeEnabled();
    const unchanged = await (await page.request.get(`/api/cut/projects/${next.id}`)).json();
    expect(unchanged.edl).toEqual(next.edl); expect(unchanged.revision).toBe(next.revision);
  } finally { release(); }
});

test("primary mixer gain and mute reach the actual simple rendered soundtrack", async ({ page }, info) => {
  test.setTimeout(120_000);
  const project = await createProject(page, info, "Primary mixer export");
  await page.goto(`/cut-studio?project=${project.id}`);
  const fullRender = page.getByRole("button", { name: "Render full edit", exact: true });
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  const renderRms = async () => {
    await expect(fullRender).toBeEnabled();
    const current = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
    const response = await page.request.post(`/api/cut/projects/${project.id}/render`, { headers: { "If-Match": String(current.revision) }, data: { resolution: "720p", quality: "draft", captions: false } });
    expect(response.ok(), await response.text()).toBeTruthy(); const job = await response.json();
    await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).state, { timeout: 60_000 }).toBe("done");
    const media = await page.request.get(`/api/cut/jobs/${job.id}/media-file`); expect(media.ok()).toBeTruthy();
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-ss", "0.1", "-t", "0.6", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { input: await media.body(), maxBuffer: 2_000_000 });
    expect(pcm.length).toBe(28800 * 4);
    let sum = 0; for (let offset = 0; offset < pcm.length; offset += 4) sum += pcm.readFloatLE(offset) ** 2;
    const rms = Math.sqrt(sum / (pcm.length / 4));
    await info.attach(`render-${job.id}-audio`, { body: JSON.stringify({ jobId: job.id, revision: current.revision, rms }), contentType: "application/json" });
    return rms;
  };
  const baseline = await renderRms(); expect(baseline).toBeGreaterThan(.03);
  await gain.press("Home"); for (let n = 0; n < 5; n++) await gain.press("ArrowRight");
  await expect(gain).toHaveValue("0.25");
  const quiet = await renderRms(); expect(quiet / baseline).toBeGreaterThan(.23); expect(quiet / baseline).toBeLessThan(.27);
  await page.getByRole("button", { name: "Mute V1 track", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute V1 track", exact: true })).toBeVisible();
  expect(await renderRms()).toBeLessThan(.00001);
});

test("leaving a failed unsaved edit requires an explicit discard decision", async ({ page }, info) => {
  const project = await createProject(page, info, "Unsaved departure custody");
  await page.goto(`/cut-studio?project=${project.id}`);
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic save outage" }) });
  });
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  await gain.press("ArrowLeft"); const draft = await gain.inputValue();
  const projects = page.getByRole("button", { name: "Projects", exact: true });
  page.once("dialog", async (dialog) => { expect(dialog.type()).toBe("confirm"); expect(dialog.message()).toContain("Leave without saving"); await dialog.dismiss(); });
  await projects.click();
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
  await expect(gain).toHaveValue(draft);
  await expect(page.getByRole("button", { name: "Retry saving edit", exact: true })).toBeVisible();
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Leave without saving"); await dialog.dismiss(); });
  await projects.click(); await expect(gain).toHaveValue(draft);
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Leave without saving"); await dialog.accept(); });
  await projects.click();
  await expect(page.getByRole("button", { name: "Open Unsaved departure custody", exact: true })).toBeVisible();
  const stored = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(stored.edl).toEqual(project.edl); expect(stored.revision).toBe(project.revision);
});

test("background completion waits for the confirmed timeline save before refreshing", async ({ page }, info) => {
  const project = await createProject(page, info, "Background refresh custody");
  const jobId = "11111111-1111-4111-8111-111111111111";
  let completed = false, projectLoads = 0;
  const job = () => ({ id: jobId, kind: "transcribe", state: completed ? "done" : "running", detail: "Synthetic metadata refresh", progress: completed ? 1 : .5 });
  await page.route(`**/api/cut/projects/${project.id}`, async (route) => {
    const response = await route.fetch(); const body = await response.json();
    projectLoads++; await route.fulfill({ response, json: { ...body, jobs: [job()] } });
  });
  await page.route(`**/api/cut/jobs/${jobId}`, async (route) => { completed = true; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(job()) }); });
  let release!: () => void, committed = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/projects/${project.id}/edl`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch(); committed = true; await gate; await route.fulfill({ response });
  });
  try {
    await page.goto(`/cut-studio?project=${project.id}`);
    const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
    await gain.press("ArrowLeft"); const draft = await gain.inputValue();
    await expect.poll(() => committed).toBe(true);
    await expect(page.getByText("A background update is ready. Your current edit will stay here until it has saved.", { exact: true })).toBeVisible();
    expect(projectLoads).toBe(1); await expect(gain).toHaveValue(draft);
    await expect(page.getByRole("button", { name: "Render full edit", exact: true })).toBeDisabled();
    release();
    await expect.poll(() => projectLoads).toBe(2);
    await expect(gain).toHaveValue(draft);
    await expect(page.getByRole("button", { name: "Render full edit", exact: true })).toBeEnabled();
    const stored = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
    expect(stored.edl.tracks.find((track: any) => track.track === "v1").gain).toBe(Number(draft));
  } finally { release(); }
});
