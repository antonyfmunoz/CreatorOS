import { expect, test } from "@playwright/test";

test("Vision provides governed capture, grounded observations, expiring watches, presets, and an immediate stop path", async ({ page }) => {
  await page.goto("/vision");
  await expect(page.getByRole("heading", { name: "Vision Studio" })).toBeVisible();
  await expect(page.getByText("Capture is off")).toBeVisible();
  await expect(page.getByText("Privacy governance")).toBeVisible();

  const stamp = Date.now();
  const create = await page.request.post("/api/vision/sessions", { data: { title: `Vision field test ${stamp}`, source: "camera", quality: "balanced", captureNoticeAcknowledged: true } });
  expect(create.status(), await create.text()).toBe(201);
  const session = await create.json() as { id: string; version: number; status: string };
  expect(session.status).toBe("ready");

  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "start", captureNoticeAcknowledged: true } })).status()).toBe(200);
  const frameId = `frame_${crypto.randomUUID()}`;
  const observe = await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "observe", observation: { frameId, kind: "scene_snapshot", summary: "Operator captured a grounded scene snapshot.", confidence: 1, source: "browser_measurement", operatorConfirmed: true, width: 1280, height: 720, metrics: { brightness: 0.52, contrast: 0.48, compositionScore: 0.75 } } } });
  expect(observe.status()).toBe(201);
  const observation = await observe.json() as Record<string, unknown>;
  expect(observation).not.toHaveProperty("image");
  expect(observation).not.toHaveProperty("imageBase64");

  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "observe", observation: { frameId: `frame_${crypto.randomUUID()}`, kind: "operator_label", label: "notebook", summary: "Notebook", confidence: 1, source: "operator", operatorConfirmed: false, width: 1280, height: 720, metrics: {} } } })).status()).toBe(400);
  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "observe", observation: { frameId: `frame_${crypto.randomUUID()}`, kind: "operator_label", label: "emotion identity", summary: "Forbidden biometric claim", confidence: 1, source: "operator", operatorConfirmed: true, width: 1280, height: 720, metrics: {} } } })).status()).toBe(400);
  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "observe", observation: { frameId, kind: "operator_label", label: "notebook", summary: "Operator confirmed notebook", confidence: 1, source: "operator", operatorConfirmed: true, width: 1280, height: 720, metrics: {} } } })).status()).toBe(201);

  const watch = await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "watch_start", target: "scene", condition: "activity_changed", durationMinutes: 60 } });
  expect(watch.status()).toBe(201);
  const watchBody = await watch.json() as { id: string; expiresAt: string };
  expect(new Date(watchBody.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60_000 + 2_000);
  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "watch_trigger", watchId: watchBody.id, frameId: `activity_${crypto.randomUUID()}`, motionScore: 0.42, source: "browser_measurement" } })).status()).toBe(201);
  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "follow_start", target: "operator" } })).status()).toBe(200);

  const presetCreate = await page.request.post("/api/vision/presets", { data: { label: `Desk ${stamp}`, description: "Desk framing", source: "camera", quality: "high", settings: { facingMode: "environment", mirrorPreview: false, compositionGrid: "thirds" } } });
  expect(presetCreate.status()).toBe(201);
  const preset = await presetCreate.json() as { id: string; version: number };
  expect((await page.request.patch(`/api/vision/presets/${preset.id}`, { data: { description: "Stale save", version: preset.version + 1 } })).status()).toBe(409);

  const beforeActivation = await (await page.request.get(`/api/vision/sessions/${session.id}`)).json() as { session: { version: number } };
  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "activate_preset", presetId: preset.id, version: beforeActivation.session.version } })).status()).toBe(200);
  expect((await page.request.post(`/api/vision/sessions/${session.id}/commands`, { data: { command: "stop", reason: "field_test_complete" } })).status()).toBe(200);

  const detail = await (await page.request.get(`/api/vision/sessions/${session.id}`)).json() as { session: { status: string; followTarget: string | null }; currentScene: { frameId: string; expired: boolean }; watches: Array<{ id: string; status: string }>; events: Array<{ eventType: string }> };
  expect(detail.session.status).toBe("stopped");
  expect(detail.session.followTarget).toBeNull();
  expect(detail.currentScene.frameId).toBe(frameId);
  expect(detail.currentScene.expired).toBe(false);
  expect(detail.watches.find((candidate) => candidate.id === watchBody.id)?.status).toBe("stopped");
  expect(detail.events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["vision.session.created", "vision.session.started", "vision.observation.recorded", "vision.watch.started", "vision.watch.triggered", "vision.follow.started", "vision.preset.activated", "vision.session.stopped"]));

  await page.reload();
  await expect(page.getByText(`Vision field test ${stamp}`)).toBeVisible();
  await page.getByText(`Vision field test ${stamp}`).click();
  await expect(page.getByText("Grounded scene")).toBeVisible();
});
