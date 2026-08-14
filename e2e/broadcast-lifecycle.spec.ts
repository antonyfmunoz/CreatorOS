import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createBroadcastSceneFromTemplate } from "../shared/broadcast-studio";

function ownerFor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

async function api(
  page: Page,
  owner: number,
  method: string,
  url: string,
  data?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(owner), ...extraHeaders },
  });
}

async function expectOk(response: APIResponse) {
  expect(
    response.ok(),
    `${response.status()} ${response.url()}: ${await response.text()}`,
  ).toBeTruthy();
}

function generateBroadcastHandoffFixtures(testInfo: TestInfo) {
  const directory = testInfo.outputPath("broadcast-handoff-fixtures");
  mkdirSync(directory, { recursive: true });
  const program = `${directory}/program.mp4`;
  const camera = `${directory}/camera.webm`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", program]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x1d9bf0:size=640x360:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", "-shortest", camera]);
  return { program, camera };
}

async function uploadPrivateBroadcastFixture(page: Page, owner: number, filePath: string, name: string, mimeType: string) {
  const response = await page.request.post("/api/assets/upload-proxy", { headers: { "x-creativesos-demo-user": String(owner) }, multipart: { kind: "video", visibility: "private", video: { name, mimeType, buffer: readFileSync(filePath) } } });
  await expectOk(response);
  return (await response.json()).asset as { id: string };
}

async function uploadPrivateBroadcastImage(page: Page, owner: number, name: string) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAfKxWiAAAAAASUVORK5CYII=", "base64");
  const response = await page.request.post("/api/assets/upload-proxy", { headers: { "x-creativesos-demo-user": String(owner) }, multipart: { kind: "photo", visibility: "private", photo: { name, mimeType: "image/png", buffer: png } } });
  await expectOk(response);
  return (await response.json()).asset as { id: string };
}

test("Broadcast Studio completes an owner-scoped encoder and private recording lifecycle", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const createdResponse = await api(
    page,
    owner,
    "POST",
    "/api/broadcast/studios",
    { name: `Qualification studio ${Date.now()}` },
  );
  await expectOk(createdResponse);
  const studio = await createdResponse.json();
  expect(studio.config).toMatchObject({
    canvas: { width: 1280, height: 720, fps: 30 },
    output: { videoBitrateKbps: 4500, audioBitrateKbps: 128 },
  });

  expect(
    (
      await api(page, peer, "GET", `/api/broadcast/studios/${studio.id}`)
    ).status(),
  ).toBe(404);
  const config = {
    ...studio.config,
    transition: { type: "fade", durationMs: 500 },
    output: { videoBitrateKbps: 2500, audioBitrateKbps: 96 },
  };
  const updatedResponse = await api(
    page,
    owner,
    "PUT",
    `/api/broadcast/studios/${studio.id}`,
    { name: studio.name, config },
    { "If-Match": String(studio.revision) },
  );
  await expectOk(updatedResponse);
  expect((await updatedResponse.json()).revision).toBe(studio.revision + 1);

  const startedResponse = await api(
    page,
    owner,
    "POST",
    `/api/broadcast/studios/${studio.id}/sessions`,
    {
      destinationId: null,
      outputMode: "recording",
      sourceMode: "test_pattern",
      videoBitrateKbps: 2500,
      audioBitrateKbps: 96,
    },
  );
  await expectOk(startedResponse);
  const started = await startedResponse.json();
  expect(started.state).toBe("live");

  const markerResponse = await api(
    page,
    owner,
    "POST",
    `/api/broadcast/sessions/${started.id}/markers`,
    { kind: "highlight", label: "Opening highlight" },
  );
  await expectOk(markerResponse);
  expect(await markerResponse.json()).toMatchObject({
    kind: "highlight",
    label: "Opening highlight",
    positionMs: expect.any(Number),
  });
  expect((await api(page, peer, "POST", `/api/broadcast/sessions/${started.id}/markers`, { kind: "note", label: "Unauthorized" })).status()).toBe(404);

  const audienceMessageResponse = await api(page, peer, "POST", `/api/broadcast/sessions/${started.id}/audience/messages`, { body: "Show the launch link" });
  await expectOk(audienceMessageResponse);
  const audienceMessage = await audienceMessageResponse.json();
  expect((await api(page, peer, "POST", `/api/broadcast/sessions/${started.id}/audience/messages/${audienceMessage.id}/moderate`, { action: "feature" })).status()).toBe(404);
  const featureResponse = await api(page, owner, "POST", `/api/broadcast/sessions/${started.id}/audience/messages/${audienceMessage.id}/moderate`, { action: "feature" });
  await expectOk(featureResponse);
  expect(await featureResponse.json()).toMatchObject({ featured: true, status: "visible", body: "Show the launch link" });
  const ctaResponse = await api(page, owner, "POST", `/api/broadcast/sessions/${started.id}/audience/cta`, { label: "Get the launch guide", actionUrl: "https://creativesos.net/" });
  await expectOk(ctaResponse);
  expect(await ctaResponse.json()).toMatchObject({ kind: "cta", featured: true, actionUrl: "https://creativesos.net/" });
  const audienceResponse = await api(page, peer, "GET", `/api/broadcast/sessions/${started.id}/audience`);
  await expectOk(audienceResponse);
  expect(await audienceResponse.json()).toMatchObject({ access: { productionTeam: false, canModerate: false }, messages: expect.arrayContaining([expect.objectContaining({ id: audienceMessage.id, body: "Show the launch link", featured: false }), expect.objectContaining({ kind: "cta", body: "Get the launch guide", featured: true })]) });
  await page.goto(`/broadcast/audience/${started.id}`);
  await expect(page.getByRole("heading", { name: "Live audience room" })).toBeVisible();
  await expect(page.getByText("Get the launch guide", { exact: true })).toBeVisible();
  await expect(page.getByText("Show the launch link", { exact: true })).toBeVisible();

  await expect
    .poll(
      async () => {
        const response = await api(
          page,
          owner,
          "GET",
          `/api/broadcast/sessions/${started.id}`,
        );
        await expectOk(response);
        return Number((await response.json()).health?.frame ?? 0);
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  const stoppedResponse = await api(
    page,
    owner,
    "POST",
    `/api/broadcast/sessions/${started.id}/stop`,
    {},
  );
  await expectOk(stoppedResponse);
  await expect
    .poll(
      async () => {
        const response = await api(
          page,
          owner,
          "GET",
          `/api/broadcast/sessions/${started.id}`,
        );
        await expectOk(response);
        return (await response.json()).state;
      },
      { timeout: 20_000 },
    )
    .toBe("complete");
  const completedResponse = await api(
    page,
    owner,
    "GET",
    `/api/broadcast/sessions/${started.id}`,
  );
  await expectOk(completedResponse);
  const completed = await completedResponse.json();
  expect(completed).toMatchObject({
    state: "complete",
    recordingAssetId: expect.any(String),
    markers: [expect.objectContaining({ label: "Opening highlight" })],
    destinationReceipts: [expect.objectContaining({
      destinationName: "Private recording",
      state: "complete",
    })],
  });

  const mediaResponse = await api(
    page,
    owner,
    "GET",
    `/api/broadcast/sessions/${started.id}/media`,
  );
  expect([200, 503]).toContain(mediaResponse.status());
  if (mediaResponse.status() === 200) {
    expect(await mediaResponse.json()).toMatchObject({
      url: expect.any(String),
    });
  } else {
    expect(await mediaResponse.json()).toMatchObject({
      message: "Private recording delivery is not configured",
    });
  }
  expect(completed.health).toMatchObject({
    frame: expect.any(Number),
    statusTier: "healthy",
  });
  expect((await api(page, peer, "POST", `/api/broadcast/sessions/${started.id}/cut-studio`, {})).status()).toBe(404);
  const cutProjectResponse = await api(page, owner, "POST", `/api/broadcast/sessions/${started.id}/cut-studio`, {});
  await expectOk(cutProjectResponse);
  const cutHandoff = await cutProjectResponse.json();
  expect(cutHandoff).toMatchObject({ reused: false, importedTrackCount: 0, project: { sourceAssetId: completed.recordingAssetId, mediaKind: "video", edl: { version: 3, markers: [expect.objectContaining({ label: "Opening highlight", kind: "beat" })] } } });
  const repeatedCutProjectResponse = await api(page, owner, "POST", `/api/broadcast/sessions/${started.id}/cut-studio`, {});
  await expectOk(repeatedCutProjectResponse);
  expect(await repeatedCutProjectResponse.json()).toMatchObject({ reused: true, project: { id: cutHandoff.project.id } });
  const cutProjectDetailResponse = await api(page, owner, "GET", `/api/cut/projects/${cutHandoff.project.id}`);
  await expectOk(cutProjectDetailResponse);
  expect(await cutProjectDetailResponse.json()).toMatchObject({ media: [expect.objectContaining({ assetId: completed.recordingAssetId, mediaKind: "video" })] });
});

test("Broadcast Studio exposes independent operator controls and explicit capture consent", async ({
  page,
}, testInfo) => {
  test.setTimeout(110_000);
  const owner = ownerFor(testInfo);
  const studiosResponse = await api(
    page,
    owner,
    "GET",
    "/api/broadcast/studios",
  );
  await expectOk(studiosResponse);
  if ((await studiosResponse.json()).length === 0) {
    await expectOk(
      await api(page, owner, "POST", "/api/broadcast/studios", {
        name: `Operator studio ${Date.now()}`,
      }),
    );
  }
  await page.goto("/broadcast");
  const viewport = page.viewportSize();
  const workspace = await page.locator(".app-container").boundingBox();
  expect(workspace).not.toBeNull();
  if (viewport && viewport.width >= 1200) {
    expect(workspace!.width).toBeGreaterThan(1000);
  } else {
    expect(workspace!.width).toBeLessThanOrEqual(720);
  }
  await expect(
    page.locator("header").getByText(/Broadcast Studio/),
  ).toBeVisible();
  await expect(page.getByText("Scenes", { exact: true })).toBeVisible();
  await expect(page.getByText("Sources", { exact: true })).toBeVisible();
  await expect(page.getByText("Brand kit", { exact: true })).toBeVisible();
  await expect(page.getByText("Audio mixer", { exact: true })).toBeVisible();
  await expect(page.getByText("Output health", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Production settings", { exact: true }),
  ).toBeVisible();

  const record = page.getByRole("button", { name: "Record" });
  await expect(record).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(record).toBeEnabled();

  await page.getByLabel("Transition type").selectOption("fade");
  await expect(page.getByLabel("Fade duration milliseconds")).toBeVisible();
  await page.getByRole("button", { name: "Add text" }).click();
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeVisible();
  await page.getByLabel("Source preset name").fill("Reusable headline");
  await page.getByRole("button", { name: "Save source preset" }).click();
  await expect(page.getByRole("button", { name: "Apply Reusable headline source preset" })).toBeVisible();
  await page.getByRole("button", { name: "Apply Reusable headline source preset" }).click();
  await expect(page.getByRole("button", { name: "Reusable headline", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lower third", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Lower third", exact: true })).toHaveCount(2);
  await page.getByLabel("Scene template").selectOption("interview");
  await page.getByRole("button", { name: "Add template" }).click();
  await expect(page.getByRole("button", { name: /Two-person interview/ })).toBeVisible();
  await page.getByLabel("Scene preset name").fill("Weekly show");
  await page.getByRole("button", { name: "Save scene preset" }).click();
  await page.getByRole("button", { name: "Apply Weekly show scene preset" }).click();
  await expect(page.getByRole("button", { name: "3 Weekly show", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Transition to program" }).click();
  await page.getByRole("button", { name: "Lower third", exact: true }).first().click();
  await page.getByLabel("Overlay motion").selectOption("fade");
  await expect(page.getByLabel("Overlay motion")).toHaveValue("fade");
  await page.getByLabel("Host camera compressor").click();
  await page.getByLabel("Host camera audio monitoring").click();
  await expect(page.getByLabel("Host camera echo cancellation")).toBeChecked();
  await expect(page.getByLabel("Host camera noise suppression")).toBeChecked();
  await expect(page.getByLabel("Host camera automatic gain control")).toBeChecked();
  await page.getByLabel("Host camera noise suppression").click();
  await expect(page.getByLabel("Host camera compressor")).toBeChecked();
  await expect(page.getByLabel("Host camera audio monitoring")).toBeChecked();
  await expect(page.getByLabel("Host camera noise suppression")).not.toBeChecked();
  await page.getByRole("button", { name: "Host camera", exact: true }).click();
  await page.getByLabel("Enable chroma key").click();
  await page.getByLabel("Chroma key color").fill("#00ee22");
  await expect(page.getByLabel("Enable chroma key")).toBeChecked();
  await page.getByLabel("Surface brand color").fill("#112233");
  await page.getByRole("button", { name: "Apply to branded graphics" }).click();
  await expect(page.getByText(/Operator keys:/)).toBeVisible();
  await page.getByLabel("Broadcast resolution").selectOption("1080x1920");
  await expect(page.getByLabel("Broadcast resolution")).toHaveValue("1080x1920");

  const persistedStudiosResponse = await api(page, owner, "GET", "/api/broadcast/studios");
  await expectOk(persistedStudiosResponse);
  const persistedStudios = await persistedStudiosResponse.json();
  expect(persistedStudios.some((studio: { config?: { sourcePresets?: Array<{ name: string }> } }) =>
    studio.config?.sourcePresets?.some((preset) => preset.name === "Reusable headline"),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenes?: Array<{ sources?: Array<{ name: string; audioProcessing?: { compressor: boolean; monitor: boolean; echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean } }> }> } }) =>
    studio.config?.scenes?.some((scene) => scene.sources?.some((source) => source.name === "Host camera" && source.audioProcessing?.compressor && source.audioProcessing.monitor && source.audioProcessing.echoCancellation && !source.audioProcessing.noiseSuppression && source.audioProcessing.autoGainControl)),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenes?: Array<{ sources?: Array<{ name: string; chromaKey?: { enabled: boolean; color: string } }> }> } }) =>
    studio.config?.scenes?.some((scene) => scene.sources?.some((source) => source.name === "Host camera" && source.chromaKey?.enabled && source.chromaKey.color === "#00ee22")),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenes?: Array<{ sources?: Array<{ name: string; presentation?: { animation: string } }> }> } }) =>
    studio.config?.scenes?.some((scene) => scene.sources?.some((source) => source.name === "Lower third" && source.presentation?.animation === "fade")),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenePresets?: Array<{ name: string }> } }) => studio.config?.scenePresets?.some((preset) => preset.name === "Weekly show"))).toBe(true);
});

test("Broadcast shares portable scene and source templates across a business", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Template catalog ${Date.now()}` });
  await expectOk(createdResponse);
  const studio = await createdResponse.json();
  const source = { ...studio.config.scenes[0].sources[0], assetId: "00000000-0000-4000-8000-000000000001" };
  const sourceName = `Shared source ${owner}`;
  const sceneName = `Shared scene ${owner}`;
  await expectOk(await api(page, owner, "POST", "/api/broadcast/templates", { businessId: studio.businessId, kind: "source", name: sourceName, payload: source }));
  await expectOk(await api(page, owner, "POST", "/api/broadcast/templates", { businessId: studio.businessId, kind: "scene", name: sceneName, payload: { ...studio.config.scenes[0], sources: [source] } }));
  expect((await api(page, peer, "GET", `/api/broadcast/templates?businessId=${studio.businessId}`)).status()).toBe(404);
  const catalogResponse = await api(page, owner, "GET", `/api/broadcast/templates?businessId=${studio.businessId}`);
  await expectOk(catalogResponse);
  expect(await catalogResponse.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "source", name: sourceName, payload: expect.objectContaining({ assetId: null }) }),
    expect.objectContaining({ kind: "scene", name: sceneName, payload: expect.objectContaining({ sources: [expect.objectContaining({ assetId: null })] }) }),
  ]));
  await page.goto("/broadcast");
  const studioSwitcher = page.getByRole("combobox", { name: "Broadcast studio", exact: true });
  if (await studioSwitcher.count()) await studioSwitcher.selectOption(studio.id);
  await expect(page.getByRole("button", { name: `Apply ${sourceName} business template` })).toBeVisible();
  await page.getByRole("button", { name: `Apply ${sourceName} business template` }).click();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}`);
    await expectOk(response);
    return (await response.json()).config.scenes[0].sources.length;
  }).toBeGreaterThan(studio.config.scenes[0].sources.length);
});

test("Broadcast opens a durable multitrack recording directly in CutStudio", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const fixture = generateBroadcastHandoffFixtures(testInfo);
  const program = await uploadPrivateBroadcastFixture(page, owner, fixture.program, "connected-program.mp4", "video/mp4");
  const camera = await uploadPrivateBroadcastFixture(page, owner, fixture.camera, "connected-camera.webm", "video/webm");
  const studioResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Connected production ${Date.now()}` });
  await expectOk(studioResponse);
  const studio = await studioResponse.json();
  const sessionResponse = await api(page, owner, "POST", `/api/broadcast/studios/${studio.id}/recordings`, { assetId: program.id, durationMs: 2_000 });
  await expectOk(sessionResponse);
  const session = await sessionResponse.json();
  const trackResponse = await api(page, owner, "POST", `/api/broadcast/sessions/${session.id}/tracks`, { assetId: camera.id, sourceId: "field_camera", sourceName: "Field camera", sourceType: "camera", mimeType: "video/webm", durationMs: 2_000, quality: { width: 640, height: 360, fps: 24, audioChannels: 1, sampleRate: 48_000 } });
  await expectOk(trackResponse);
  expect((await api(page, peer, "POST", `/api/broadcast/sessions/${session.id}/cut-studio`, {})).status()).toBe(404);

  await page.goto("/broadcast");
  await expect(page.locator("header h1")).toBeVisible();
  const studioSwitcher = page.getByRole("combobox", { name: "Broadcast studio", exact: true });
  if (await studioSwitcher.count()) await studioSwitcher.selectOption(studio.id);
  await expect(page.getByRole("heading", { name: studio.name })).toBeVisible();
  await expect(page.getByText("Isolated source recordings", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit in CutStudio" }).click();
  await expect(page).toHaveURL(/\/cut-studio\?project=[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: /Connected production.*recording/ })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Field camera", { exact: true })).toBeVisible();
  const projectId = new URL(page.url()).searchParams.get("project")!;
  const projectResponse = await api(page, owner, "GET", `/api/cut/projects/${projectId}`);
  await expectOk(projectResponse);
  expect(await projectResponse.json()).toMatchObject({ sourceAssetId: program.id, edl: { version: 3, clips: expect.arrayContaining([expect.objectContaining({ id: "broadcast_program", track: "v1", volume: 1 }), expect.objectContaining({ assetId: camera.id, track: "v2", groupId: "broadcast_sources", volume: 0, transform: { opacity: 0 } })]) }, media: expect.arrayContaining([expect.objectContaining({ assetId: program.id }), expect.objectContaining({ assetId: camera.id, name: "Field camera" })]) });
  const repeated = await api(page, owner, "POST", `/api/broadcast/sessions/${session.id}/cut-studio`, {});
  await expectOk(repeated);
  expect(await repeated.json()).toMatchObject({ reused: true, project: { id: projectId } });
});

test("Broadcast routes program and monitor audio with persisted sync and balance", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Audio routing ${Date.now()}` });
  await expectOk(createdResponse);
  const studio = await createdResponse.json();
  const templated = createBroadcastSceneFromTemplate(studio.config, "interview", "scene_audio_route");
  const config = { ...templated, programSceneId: "scene_audio_route" };
  await expectOk(await api(page, owner, "PUT", `/api/broadcast/studios/${studio.id}`, { name: studio.name, config }, { "If-Match": String(studio.revision) }));

  const hostAudio = async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}`);
    await expectOk(response);
    const current = await response.json();
    return current.config.scenes.flatMap((item: { sources: Array<{ name: string; audioProcessing: Record<string, unknown> }> }) => item.sources).find((source: { name: string }) => source.name === "Host camera")?.audioProcessing;
  };

  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: studio.name })).toBeVisible();
  await expect(page.getByLabel("Host camera program audio bus")).toBeChecked();
  await page.getByLabel("Host camera mix bus").selectOption("music");
  await expect.poll(async () => (await hostAudio())?.bus).toBe("music");
  const musicGain = page.getByLabel("Music bus gain");
  await musicGain.press("Home");
  await musicGain.press("ArrowRight");
  await musicGain.press("ArrowRight");
  await expect(musicGain).toHaveAttribute("aria-valuenow", "2");
  await page.getByLabel("Mute Music bus").click();
  const currentMix = async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}`);
    await expectOk(response);
    const current = await response.json();
    return current.config.audioBuses.find((bus: { id: string }) => bus.id === "music");
  };
  await expect.poll(currentMix).toMatchObject({ gain: 0.02, muted: true });
  await page.reload();
  await expect(page.getByLabel("Host camera mix bus")).toHaveValue("music");
  await expect(page.getByLabel("Music bus gain")).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByLabel("Unmute Music bus")).toBeVisible();
  await page.getByLabel("Host camera program audio bus").click();
  await expect.poll(async () => (await hostAudio())?.routeToProgram).toBe(false);

  const delay = page.getByLabel("Host camera audio sync delay");
  await delay.press("End");
  await expect(delay).toHaveAttribute("aria-valuenow", "2000");
  await expect.poll(async () => (await hostAudio())?.syncOffsetMs).toBe(2000);

  const balance = page.getByLabel("Host camera stereo balance");
  await balance.press("ArrowRight");
  await balance.press("ArrowRight");
  await expect(balance).toHaveAttribute("aria-valuenow", "0.1");
  await expect.poll(async () => (await hostAudio())?.stereoBalance).toBe(0.1);
  await expect(page.getByLabel("Host camera audio monitoring")).not.toBeChecked();
});

test("Broadcast persists production overlay entrance presets", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Overlay motion ${Date.now()}` });
  await expectOk(createdResponse);
  const studio = await createdResponse.json();
  const templated = createBroadcastSceneFromTemplate(studio.config, "interview", "scene_overlay_motion");
  const config = { ...templated, previewSceneId: "scene_overlay_motion", programSceneId: "scene_overlay_motion" };
  await expectOk(await api(page, owner, "PUT", `/api/broadcast/studios/${studio.id}`, { name: studio.name, config }, { "If-Match": String(studio.revision) }));

  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: studio.name })).toBeVisible();
  await page.getByRole("button", { name: "Lower third", exact: true }).first().click();
  for (const motion of ["rise", "wipe", "pop"] as const) {
    await page.getByLabel("Overlay motion").selectOption(motion);
    await expect(page.getByLabel("Overlay motion")).toHaveValue(motion);
    await expect.poll(async () => {
      const response = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}`);
      await expectOk(response);
      const current = await response.json();
      return current.config.scenes.flatMap((scene: { sources: Array<{ name: string; presentation?: { animation: string } }> }) => scene.sources).find((source: { name: string }) => source.name === "Lower third")?.presentation?.animation;
    }).toBe(motion);
  }
  await page.reload();
  await page.getByRole("button", { name: "Lower third", exact: true }).first().click();
  await expect(page.getByLabel("Overlay motion")).toHaveValue("pop");
});

test("Broadcast owner shares an editable studio without delegating live authority", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const peerUsername = peer === 1 ? "owner" : "sarahmitchell";
  const ownerUsername = owner === 1 ? "owner" : "sarahmitchell";
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Shared production ${Date.now()}` });
  await expectOk(createdResponse);
  const studio = await createdResponse.json();

  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: studio.name })).toBeVisible();
  await page.getByLabel("Broadcast collaborator username").fill(peerUsername);
  await page.getByLabel("Broadcast collaborator role").selectOption("editor");
  await page.getByRole("button", { name: "Share studio" }).click();
  await expect(page.getByText(`@${peerUsername}`)).toBeVisible();

  const peerStudioResponse = await api(page, peer, "GET", `/api/broadcast/studios/${studio.id}`);
  await expectOk(peerStudioResponse);
  const peerStudio = await peerStudioResponse.json();
  expect(peerStudio).toMatchObject({ access: { role: "editor", canEdit: true, canOperate: false }, participants: expect.arrayContaining([expect.objectContaining({ username: ownerUsername, role: "owner" }), expect.objectContaining({ username: peerUsername, role: "editor" })]) });
  const editedConfig = { ...peerStudio.config, replayBufferSeconds: 45 };
  const editResponse = await api(page, peer, "PUT", `/api/broadcast/studios/${studio.id}`, { name: studio.name, config: editedConfig }, { "If-Match": String(peerStudio.revision) });
  await expectOk(editResponse);
  expect(await editResponse.json()).toMatchObject({ config: { replayBufferSeconds: 45 }, access: { role: "editor", canOperate: false } });
  expect((await api(page, peer, "POST", `/api/broadcast/studios/${studio.id}/sessions`, { outputMode: "recording", sourceMode: "test_pattern" })).status()).toBe(404);
  expect((await api(page, peer, "DELETE", `/api/broadcast/studios/${studio.id}`)).status()).toBe(404);

  await page.getByLabel("Broadcast collaborator username").fill(peerUsername);
  await page.getByLabel("Broadcast collaborator role").selectOption("viewer");
  await page.getByRole("button", { name: "Share studio" }).click();
  await expect(page.getByText("viewer", { exact: true })).toBeVisible();
  const viewerStudioResponse = await api(page, peer, "GET", `/api/broadcast/studios/${studio.id}`);
  await expectOk(viewerStudioResponse);
  const viewerStudio = await viewerStudioResponse.json();
  expect(viewerStudio).toMatchObject({ access: { role: "viewer", canEdit: false, canOperate: false } });
  expect((await api(page, peer, "PUT", `/api/broadcast/studios/${studio.id}`, { name: studio.name, config: viewerStudio.config }, { "If-Match": String(viewerStudio.revision) })).status()).toBe(404);

  await page.getByLabel(`Remove ${peerUsername} from broadcast studio`).click();
  await expect(page.getByText(`@${peerUsername}`)).toHaveCount(0);
  expect((await api(page, peer, "GET", `/api/broadcast/studios/${studio.id}`)).status()).toBe(404);
});

test("Broadcast preserves and restores immutable studio configuration history", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Versioned studio ${Date.now()}` });
  await expectOk(createdResponse);
  const created = await createdResponse.json();
  const firstResponse = await api(page, owner, "PUT", `/api/broadcast/studios/${created.id}`, { name: "First production plan", config: { ...created.config, replayBufferSeconds: 45 } }, { "If-Match": String(created.revision) });
  await expectOk(firstResponse);
  const first = await firstResponse.json();
  const secondResponse = await api(page, owner, "PUT", `/api/broadcast/studios/${created.id}`, { name: "Second production plan", config: { ...first.config, replayBufferSeconds: 75 } }, { "If-Match": String(first.revision) });
  await expectOk(secondResponse);
  const second = await secondResponse.json();
  const versionsResponse = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}/versions`);
  await expectOk(versionsResponse);
  expect(await versionsResponse.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ revision: 1, name: created.name, reason: "save", access: { canRestore: true } }),
    expect.objectContaining({ revision: 2, name: "First production plan", reason: "save", access: { canRestore: true } }),
  ]));
  expect((await api(page, peer, "GET", `/api/broadcast/studios/${created.id}/versions`)).status()).toBe(404);

  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: "Second production plan" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Restore studio revision 1").click();
  await expect(page.getByText("Restored revision 1. Your previous configuration is still in history.")).toBeVisible();
  await expect(page.getByLabel("Replay buffer (seconds)")).toHaveAttribute("aria-valuetext", "30");
  const restoredResponse = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}`);
  await expectOk(restoredResponse);
  expect(await restoredResponse.json()).toMatchObject({ name: created.name, revision: second.revision + 1, config: { replayBufferSeconds: 30 } });
  const restoredVersionsResponse = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}/versions`);
  await expectOk(restoredVersionsResponse);
  expect(await restoredVersionsResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({ revision: second.revision, name: "Second production plan", reason: "restore" })]));
});

test("Broadcast brand library persists across studios and supports safe removal", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  await expectOk(await api(page, owner, "POST", "/api/broadcast/studios", { name: "Brand source studio" }));
  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: "Brand source studio" })).toBeVisible();
  await page.getByLabel("Surface brand color").fill("#112233");
  await page.getByLabel("Brand kit name").fill("Operator brand kit");
  await page.getByRole("button", { name: "Save brand kit" }).click();
  await expect(page.getByRole("button", { name: "Apply Operator brand kit brand kit" })).toBeVisible();

  await expectOk(await api(page, owner, "POST", "/api/broadcast/studios", { name: "Brand destination studio" }));
  await page.reload();
  await page.getByRole("combobox", { name: "Broadcast studio", exact: true }).selectOption({ label: "Brand destination studio" });
  await expect(page.getByRole("heading", { name: "Brand destination studio" })).toBeVisible();
  await expect(page.getByLabel("Surface brand color")).not.toHaveValue("#112233");
  await page.getByRole("button", { name: "Apply Operator brand kit brand kit" }).click();
  await expect(page.getByLabel("Surface brand color")).toHaveValue("#112233");

  await page.getByLabel("Brand kit name").fill("Disposable field kit");
  await page.getByRole("button", { name: "Save brand kit" }).click();
  await expect(page.getByRole("button", { name: "Apply Disposable field kit brand kit" })).toBeVisible();
  await page.getByRole("button", { name: "Delete Disposable field kit brand kit" }).click();
  await expect(page.getByRole("button", { name: "Apply Disposable field kit brand kit" })).toHaveCount(0);

  const studiosResponse = await api(page, owner, "GET", "/api/broadcast/studios");
  await expectOk(studiosResponse);
  const studios = await studiosResponse.json();
  expect(studios.find((item: { name: string }) => item.name === "Brand destination studio")?.config.brandKit.surfaceColor).toBe("#112233");
  const kitsResponse = await api(page, owner, "GET", "/api/broadcast/brand-kits");
  await expectOk(kitsResponse);
  const kits = await kitsResponse.json();
  expect(kits.some((kit: { name: string; surfaceColor: string }) => kit.name === "Operator brand kit" && kit.surfaceColor === "#112233")).toBe(true);
  expect(kits.some((kit: { name: string }) => kit.name === "Disposable field kit")).toBe(false);
});

test("Broadcast business media stays private and remains reusable across studios", async ({ page }) => {
  test.setTimeout(90_000);
  const owner = 1;
  const operator = 3;
  const peer = 2;
  await page.context().setExtraHTTPHeaders({ "x-creativesos-demo-user": String(owner) });
  const filename = `shared-production-${Date.now()}.png`;
  const firstResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Media source studio ${Date.now()}` });
  await expectOk(firstResponse);
  const first = await firstResponse.json();
  const asset = await uploadPrivateBroadcastImage(page, owner, filename);
  const sharedResponse = await api(page, owner, "POST", "/api/broadcast/media", { businessId: first.businessId, assetId: asset.id, name: filename });
  await expectOk(sharedResponse);
  expect((await sharedResponse.json()).library).toBe(true);
  const libraryResponse = await api(page, owner, "GET", `/api/broadcast/media?businessId=${first.businessId}`);
  await expectOk(libraryResponse);
  expect(await libraryResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: asset.id, originalFilename: filename, library: true })]));
  const ownerAccess = await api(page, owner, "GET", `/api/broadcast/media/${asset.id}/access`);
  await expectOk(ownerAccess);
  const descriptor = await ownerAccess.json() as { url: string };
  const streamed = await api(page, owner, "GET", descriptor.url);
  await expectOk(streamed);
  expect(streamed.headers()["content-type"]).toContain("image/png");
  const operatorLibrary = await api(page, operator, "GET", `/api/broadcast/media?businessId=${first.businessId}`);
  await expectOk(operatorLibrary);
  expect(await operatorLibrary.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: asset.id, access: { canRemove: false } })]));
  await expectOk(await api(page, operator, "GET", `/api/broadcast/media/${asset.id}/access`));
  expect((await api(page, peer, "GET", `/api/broadcast/media/${asset.id}/access`)).status()).toBe(404);

  const secondResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Media destination studio ${Date.now()}` });
  await expectOk(secondResponse);
  const second = await secondResponse.json();
  await page.goto("/broadcast");
  await page.getByRole("combobox", { name: "Broadcast studio", exact: true }).selectOption(second.id);
  await expect(page.getByRole("heading", { name: second.name })).toBeVisible();
  const addFromLibrary = page.getByRole("button", { name: `Add ${filename} from business library` });
  await expect(addFromLibrary).toBeVisible();
  await addFromLibrary.click();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${second.id}`);
    await expectOk(response);
    return (await response.json()).config.scenes.flatMap((scene: { sources: Array<{ assetId: string | null }> }) => scene.sources).some((source: { assetId: string | null }) => source.assetId === asset.id);
  }).toBe(true);

  await page.getByRole("button", { name: `Remove ${filename} from business library` }).click();
  await expect(page.getByRole("button", { name: `Add ${filename} from business library` })).toHaveCount(0);
  expect((await api(page, owner, "GET", `/api/broadcast/media/${asset.id}/access`)).status()).toBe(404);
  const retainedAssetAccess = await api(page, owner, "GET", `/api/assets/${asset.id}/access`);
  await expectOk(retainedAssetAccess);
  const retainedDescriptor = await retainedAssetAccess.json() as { url: string };
  await expectOk(await api(page, owner, "GET", retainedDescriptor.url));
  const retained = await api(page, owner, "GET", `/api/broadcast/studios/${second.id}`);
  await expectOk(retained);
  expect((await retained.json()).config.scenes.flatMap((scene: { sources: Array<{ assetId: string | null }> }) => scene.sources).some((source: { assetId: string | null }) => source.assetId === asset.id)).toBe(true);
});

test("Broadcast studio library creates renames switches and guards deletion", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const owner = ownerFor(testInfo);
  await expectOk(await api(page, owner, "POST", "/api/broadcast/studios", { name: "Field managed studio" }));
  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: "Field managed studio" })).toBeVisible();
  await page.getByRole("textbox", { name: "Studio name", exact: true }).fill("Field renamed studio");
  await page.getByRole("button", { name: "Save studio name" }).click();
  await expect(page.getByRole("heading", { name: "Field renamed studio" })).toBeVisible();

  await page.getByRole("textbox", { name: "New studio name", exact: true }).fill("Field second studio");
  await page.getByRole("button", { name: "Create broadcast studio" }).click();
  await expect(page.getByRole("heading", { name: "Field second studio" })).toBeVisible();
  await page.getByRole("combobox", { name: "Broadcast studio", exact: true }).selectOption({ label: "Field renamed studio" });
  await expect(page.getByRole("heading", { name: "Field renamed studio" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare studio deletion" }).click();
  await expect(page.getByRole("button", { name: "Delete Field renamed studio" })).toBeVisible();
  await page.getByRole("button", { name: "Delete Field renamed studio" }).click();
  await expect(page.getByRole("heading", { name: "Field second studio" })).toBeVisible();

  const response = await api(page, owner, "GET", "/api/broadcast/studios");
  await expectOk(response);
  const studios = await response.json();
  expect(studios.some((item: { name: string }) => item.name === "Field renamed studio")).toBe(false);
  expect(studios.some((item: { name: string }) => item.name === "Field second studio")).toBe(true);
});

test("Broadcast records and inventories a direct source-quality isolated track", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const owner = ownerFor(testInfo);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const context = canvas.getContext("2d")!;
          let frame = 0;
          const draw = () => {
            context.fillStyle = frame++ % 2 ? "#1d9bf0" : "#09090b";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "#ffffff";
            context.font = "bold 36px sans-serif";
            context.fillText("CreativesOS source", 80, 190);
            requestAnimationFrame(draw);
          };
          draw();
          const stream = canvas.captureStream(15);
          const audio = new AudioContext();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          const destination = audio.createMediaStreamDestination();
          gain.gain.value = 0.02;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
          Object.assign(globalThis, { __broadcastQualification: { canvas, audio, oscillator, stream } });
          return stream;
        },
        getDisplayMedia: async () => { throw new Error("Screen capture is not part of this qualification"); },
      },
    });
  });
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Isolated source studio ${Date.now()}` });
  await expectOk(createdResponse);
  await page.goto("/broadcast");
  await expect(page.getByRole("heading", { name: /Isolated source studio/ })).toBeVisible();
  await page.getByRole("button", { name: "Add camera" }).click();
  await expect(page.getByText("camera connected", { exact: false })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("switch", { name: "Record isolated source tracks" }).check();
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(/isolated source track capturing locally/)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3_000);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByText("Isolated source recordings", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Preview camera isolated recording/ })).toBeVisible();

  const studiosResponse = await api(page, owner, "GET", "/api/broadcast/studios");
  await expectOk(studiosResponse);
  const studio = (await studiosResponse.json()).find((item: { name: string }) => item.name.startsWith("Isolated source studio"));
  const detailResponse = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}`);
  await expectOk(detailResponse);
  const detail = await detailResponse.json();
  const track = detail.sessions.flatMap((item: { tracks?: unknown[] }) => item.tracks ?? [])[0];
  expect(track).toMatchObject({ sourceType: "camera", mimeType: expect.stringContaining("video/webm"), sizeBytes: expect.any(Number) });
  expect(track.sizeBytes).toBeGreaterThan(0);
  expect((await api(page, owner === 1 ? 2 : 1, "GET", `/api/broadcast/sessions/${track.sessionId}`)).status()).toBe(404);
});
