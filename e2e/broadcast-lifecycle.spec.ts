import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

async function uploadPrivateBroadcastLut(page: Page, owner: number, name: string, contents: string) {
  const response = await page.request.post("/api/assets/upload-proxy", { headers: { "x-creativesos-demo-user": String(owner) }, multipart: { kind: "cut-lut", visibility: "private", "cut-lut": { name, mimeType: "text/plain", buffer: Buffer.from(contents) } } });
  await expectOk(response);
  return (await response.json()).asset as { id: string };
}

test("Broadcast validates a private LUT and renders its color transform into program output", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const owner = ownerFor(testInfo); const peer = owner === 1 ? 2 : 1;
  const redPng = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=16x16", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
  const photoResponse = await page.request.post("/api/assets/upload-proxy", { headers: { "x-creativesos-demo-user": String(owner) }, multipart: { kind: "photo", visibility: "private", photo: { name: "red-source.png", mimeType: "image/png", buffer: redPng } } });
  await expectOk(photoResponse); const photo = (await photoResponse.json()).asset as { id: string };
  const lut = await uploadPrivateBroadcastLut(page, owner, "live-green.cube", `TITLE "Live green"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n${Array.from({ length: 8 }, () => "0 1 0").join("\n")}\n`);
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `LUT studio ${Date.now()}` }); await expectOk(createdResponse); const studio = await createdResponse.json();
  await expectOk(await api(page, owner, "POST", "/api/broadcast/media", { businessId: studio.businessId, assetId: photo.id, name: "red-source.png" }));
  const registeredResponse = await api(page, owner, "POST", "/api/broadcast/luts", { businessId: studio.businessId, assetId: lut.id, name: "live-green.cube" }); await expectOk(registeredResponse);
  expect((await api(page, peer, "POST", "/api/broadcast/luts", { businessId: studio.businessId, assetId: lut.id, name: "stolen.cube" })).status()).toBe(404);
  const original = studio.config.scenes[0].sources[0];
  const config = { ...studio.config, scenes: studio.config.scenes.map((scene: Record<string, unknown>, index: number) => index ? scene : { ...scene, sources: [{ ...original, name: "Graded red source", type: "image", assetId: photo.id, lutAssetId: lut.id, text: null, color: null, transform: { ...original.transform, x: 0, y: 0, width: 1, height: 1 } }] }) };
  await expectOk(await api(page, owner, "PUT", `/api/broadcast/studios/${studio.id}`, { name: studio.name, config }, { "If-Match": String(studio.revision) }));
  expect((await api(page, owner, "DELETE", `/api/broadcast/luts/${lut.id}`)).status()).toBe(409);
  await page.goto(`/broadcast?studio=${studio.id}`); await expect(page.getByRole("heading", { name: studio.name })).toBeVisible(); await expect(page.getByLabel("Broadcast source LUT")).toHaveValue(lut.id);
  await expect.poll(async () => page.getByLabel("Program canvas").evaluate((node) => { const canvas = node as HTMLCanvasElement; const pixel = canvas.getContext("2d")!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data; return pixel[0] < 80 && pixel[1] > 150 && pixel[2] < 80; }), { timeout: 20_000 }).toBe(true);
});

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
  test.setTimeout(180_000);
  const owner = ownerFor(testInfo);
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", {
    name: `Operator studio ${Date.now()}`,
  });
  await expectOk(createdResponse);
  const studio = await createdResponse.json();
  await page.goto(`/broadcast?studio=${studio.id}`);
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

  await page.getByRole("button", { name: "Destination", exact: true }).click();
  await page.getByPlaceholder("Destination name").fill("Vertical field output");
  await page.getByLabel("Destination output layout").selectOption("portrait");
  await page.getByLabel("Destination framing mode").selectOption("fill");
  await expect(page.getByLabel("Destination output layout")).toHaveValue("portrait");
  await expect(page.getByLabel("Destination framing mode")).toHaveValue("fill");
  await page.getByRole("button", { name: "Destination", exact: true }).click();

  const record = page.getByRole("button", { name: "Record" });
  await expect(record).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(record).toBeEnabled();

  await page.getByLabel("Transition type").selectOption("fade");
  await expect(page.getByLabel("Transition duration milliseconds")).toBeVisible();
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
  await expect(page.getByLabel("Weekly show multiview preview")).toBeVisible();
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
  await expect(page.getByText(/Operator keys:/)).toHaveCount(1);
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

test("Broadcast renders live multiview, native goal widgets, and operator transitions", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Multiview studio ${Date.now()}` });
  await expectOk(createdResponse);
  const created = await createdResponse.json();
  const withInterview = createBroadcastSceneFromTemplate(created.config, "interview", "scene_interview");
  const baseSource = withInterview.scenes[0].sources[0];
  const config = {
    ...withInterview,
    transition: { type: "wipe", durationMs: 350 },
    scenes: withInterview.scenes.map((scene, index) => index === 1 ? {
      ...scene,
      sources: [...scene.sources, {
        ...baseSource,
        id: "source_goal",
        name: "Launch goal",
        type: "widget",
        text: null,
        widget: { kind: "goal", title: "Launch members", value: 42, target: 100, currency: "USD", maxItems: 3 },
        muted: true,
        zOrder: scene.sources.length,
      }],
    } : scene),
  };
  const savedResponse = await api(page, owner, "PUT", `/api/broadcast/studios/${created.id}`, { name: created.name, config }, { "If-Match": String(created.revision) });
  await expectOk(savedResponse);

  await page.goto(`/broadcast?studio=${created.id}`);
  const multiview = page.getByLabel(/multiview preview/);
  await expect(multiview).toHaveCount(2);
  await expect.poll(async () => multiview.evaluateAll((canvases) => canvases.map((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const alpha = element.getContext("2d")?.getImageData(0, 0, 1, 1).data[3] ?? 0;
    return { width: element.width, alpha };
  }))).toEqual([{ width: 256, alpha: 255 }, { width: 256, alpha: 255 }]);
  await page.getByRole("button", { name: "Launch goal", exact: true }).click();
  await expect(page.getByLabel("Widget type")).toHaveValue("goal");
  await expect(page.getByLabel("Widget current value")).toHaveValue("42");
  await expect(page.getByLabel("Widget target value")).toHaveValue("100");
  await page.getByLabel("Widget title").fill("Launch goal updated");
  await page.getByLabel("Widget title").press("Tab");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}`);
    await expectOk(response);
    return (await response.json()).config.scenes[1].sources.find((source: { id: string }) => source.id === "source_goal")?.widget?.title;
  }).toBe("Launch goal updated");
  await page.getByRole("button", { name: /Two-person interview multiview preview/ }).click();
  await expect(page.getByLabel("Transition type")).toHaveValue("wipe");
  await page.getByRole("button", { name: "Transition to program" }).click();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}`);
    await expectOk(response);
    const studio = await response.json();
    return studio.config.scenes.find((scene: { id: string }) => scene.id === studio.config.programSceneId)?.name;
  }).toBe("Two-person interview");
});

test("Broadcast phone controller operates scenes, program sources, markers, and safe output stop", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const owner = ownerFor(testInfo);
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `Phone control ${Date.now()}` });
  await expectOk(createdResponse);
  const created = await createdResponse.json();
  const configured = createBroadcastSceneFromTemplate(created.config, "interview", `remote_${Date.now()}`.slice(0, 32));
  const saveResponse = await api(page, owner, "PUT", `/api/broadcast/studios/${created.id}`, { name: created.name, config: configured }, { "If-Match": String(created.revision) });
  await expectOk(saveResponse);
  const saved = await saveResponse.json();
  const startResponse = await api(page, owner, "POST", `/api/broadcast/studios/${created.id}/sessions`, { outputMode: "recording", sourceMode: "test_pattern", destinationIds: [], videoBitrateKbps: 800, audioBitrateKbps: 64 });
  await expectOk(startResponse);
  const session = await startResponse.json();

  const invitationResponse = await api(page, owner, "POST", `/api/broadcast/studios/${created.id}/capture-invitations`, { expiresInMinutes: 15 });
  await expectOk(invitationResponse);
  const invitation = await invitationResponse.json();
  const claimResponse = await page.request.post("/api/broadcast/capture/claim", { data: {
    token: invitation.token,
    name: "Remote phone camera",
    kind: "android",
    capabilities: { transports: ["srt"], videoCodecs: ["h264"], maxWidth: 1920, maxHeight: 1080, maxFps: 30 },
  } });
  await expectOk(claimResponse);

  await page.goto(`/broadcast/control/${created.id}`);
  await expect(page.getByRole("heading", { name: created.name })).toBeVisible();
  await expect(page.getByLabel("Remote program and preview")).toContainText("Main");
  await page.getByRole("button", { name: "Preview scene Two-person interview" }).click();
  await expect(page.getByLabel("Remote program and preview")).toContainText("Two-person interview");
  await page.getByRole("button", { name: /Take|fade|dip|wipe|slide/i }).click();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}`);
    await expectOk(response);
    const studio = await response.json();
    return studio.config.scenes.find((scene: { id: string }) => scene.id === studio.config.programSceneId)?.name;
  }).toBe("Two-person interview");
  await page.getByRole("button", { name: "Mute Host camera" }).click();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}`);
    const studio = await response.json();
    const program = studio.config.scenes.find((scene: { id: string }) => scene.id === studio.config.programSceneId);
    return program.sources.find((source: { name: string }) => source.name === "Host camera")?.muted;
  }).toBe(true);
  await page.getByRole("button", { name: "Direct Remote phone camera standby" }).click();
  await expect(page.getByRole("status")).toContainText("directed to standby");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${created.id}/capture-nodes`);
    await expectOk(response);
    return (await response.json())[0]?.configuration?.requestedState;
  }).toBe("standby");
  await page.getByRole("button", { name: "Highlight" }).click();
  await expect(page.getByRole("status")).toContainText("Highlight marker added");
  await page.getByRole("button", { name: "Stop output" }).click();
  await expect(page.getByRole("status")).toContainText("Output stopped safely");
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/sessions/${session.id}`);
    await expectOk(response);
    return (await response.json()).state;
  }, { timeout: 20_000, intervals: [250, 500] }).toBe("complete");
  const stoppedResponse = await api(page, owner, "GET", `/api/broadcast/sessions/${session.id}`);
  expect(await stoppedResponse.json()).toMatchObject({ state: "complete", markers: [expect.objectContaining({ label: "Remote highlight" })] });
  await expect(page.getByRole("navigation")).toHaveCount(0);
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
  await page.goto(`/broadcast?studio=${studio.id}`);
  await expect(page.getByRole("button", { name: `Apply ${sourceName} business template` })).toBeVisible();
  await page.getByRole("button", { name: `Apply ${sourceName} business template` }).click();
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}`);
    await expectOk(response);
    return (await response.json()).config.scenes[0].sources.length;
  }).toBeGreaterThan(studio.config.scenes[0].sources.length);
});

test("Broadcast opens a durable multitrack recording directly in CutStudio", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
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

  await page.goto(`/broadcast?studio=${studio.id}`);
  await expect(page.locator("header h1")).toBeVisible();
  await expect(page.getByRole("heading", { name: studio.name })).toBeVisible();
  await expect(page.getByText("Isolated source recordings", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit in CutStudio" }).click();
  await expect(page).toHaveURL(/\/cut-studio\?project=[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: /Connected production.*recording/ })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Field camera", { exact: true })).toBeVisible();
  const projectId = new URL(page.url()).searchParams.get("project")!;
  const projectResponse = await api(page, owner, "GET", `/api/cut/projects/${projectId}`);
  await expectOk(projectResponse);
  const projectData = await projectResponse.json();
  expect(projectData).toMatchObject({ sourceAssetId: program.id, edl: { version: 3, clips: expect.arrayContaining([expect.objectContaining({ label: "Program recording", track: "v1", volume: 1, groupId: expect.stringContaining("broadcast_multicam") }), expect.objectContaining({ assetId: camera.id, track: "v2", groupId: "broadcast_sources", volume: 0, transform: expect.objectContaining({ opacity: 0 }) })]), multicamGroups: [expect.objectContaining({ label: "Broadcast multicam", angles: [expect.objectContaining({ label: "Program recording", assetId: null }), expect.objectContaining({ label: "Field camera", assetId: camera.id })], switches: [expect.objectContaining({ at: 0, angleId: "angle_01" })] })] }, media: expect.arrayContaining([expect.objectContaining({ assetId: program.id }), expect.objectContaining({ assetId: camera.id, name: "Field camera" })]) });
  await expect(page.getByLabel("Multicam angle editor")).toBeVisible();
  await page.getByLabel("Timeline monitor").locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 1;
    video.dispatchEvent(new Event("timeupdate"));
  });
  await page.getByRole("button", { name: "Take multicam angle Field camera" }).click();
  const switchedProject = await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${projectId}`);
    await expectOk(response);
    const value = await response.json();
    return value.edl.multicamGroups[0].switches.length > 1 ? value : null;
  }, { timeout: 15_000, intervals: [250, 500] }).not.toBeNull().then(async () => {
    const response = await api(page, owner, "GET", `/api/cut/projects/${projectId}`);
    await expectOk(response);
    return response.json();
  });
  expect(switchedProject.edl.multicamGroups[0].switches).toEqual(expect.arrayContaining([expect.objectContaining({ at: expect.closeTo(1, 1), angleId: "angle_02" })]));
  expect(switchedProject.edl.clips).toEqual(expect.arrayContaining([
    expect.objectContaining({ track: "v1", label: "Program recording", start: 0, end: expect.closeTo(1, 1) }),
    expect.objectContaining({ track: "v1", assetId: camera.id, start: expect.closeTo(1, 1), end: 2 }),
  ]));
  const repeated = await api(page, owner, "POST", `/api/broadcast/sessions/${session.id}/cut-studio`, {});
  await expectOk(repeated);
  expect(await repeated.json()).toMatchObject({ reused: true, project: { id: projectId } });

  const transcript = {
    duration: 2,
    language: "en",
    segments: [{
      id: "connected-story",
      start: 0,
      end: 2,
      text: "Create once, distribute everywhere, and learn from every relationship.",
      speaker: "Host",
      words: [
        { word: "Create", start: 0, end: .25 },
        { word: "once,", start: .25, end: .5 },
        { word: "distribute", start: .5, end: .8 },
        { word: "everywhere,", start: .8, end: 1.1 },
        { word: "and", start: 1.1, end: 1.25 },
        { word: "learn", start: 1.25, end: 1.45 },
        { word: "from", start: 1.45, end: 1.6 },
        { word: "every", start: 1.6, end: 1.8 },
        { word: "relationship.", start: 1.8, end: 2 },
      ],
    }],
  };
  const transcriptResponse = await api(page, owner, "PUT", `/api/cut/projects/${projectId}/transcript`, transcript, { "If-Match": String(switchedProject.revision) });
  await expectOk(transcriptResponse);
  const highlightResponse = await api(page, owner, "POST", `/api/cut/projects/${projectId}/highlights`, {});
  await expectOk(highlightResponse);
  const highlightJob = await highlightResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${highlightJob.id}`)).json()).state, { timeout: 30_000 }).toBe("done");
  const renderResponse = await api(page, owner, "POST", `/api/cut/projects/${projectId}/render`, { aspect: "16:9", captions: true, captionStyle: 4, cleanAudio: false, quality: "draft", resolution: "720p", fps: 24 });
  await expectOk(renderResponse);
  const renderJob = await renderResponse.json();
  await expect.poll(async () => (await (await api(page, owner, "GET", `/api/cut/jobs/${renderJob.id}`)).json()).state, { timeout: 75_000, intervals: [500, 1_000] }).toBe("done");
  const renderMediaResponse = await api(page, owner, "GET", `/api/cut/jobs/${renderJob.id}/media`);
  await expectOk(renderMediaResponse);
  const renderMedia = await renderMediaResponse.json() as { url: string };
  const renderedFileResponse = await page.request.get(renderMedia.url);
  await expectOk(renderedFileResponse);
  const renderedPath = testInfo.outputPath("broadcast-multicam-render.mp4");
  writeFileSync(renderedPath, await renderedFileResponse.body());
  const selectedAnglePixel = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "1.5", "-i", renderedPath, "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  expect(selectedAnglePixel[2]).toBeGreaterThan(selectedAnglePixel[0] + 30);
  expect(selectedAnglePixel[2]).toBeGreaterThan(selectedAnglePixel[1] + 30);

  await page.goto(`/cut-studio?project=${projectId}`);
  await expect(page.getByRole("heading", { name: /Connected production.*recording/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue in Distribution" }).click();
  await expect(page).toHaveURL(/\/distribution\?.*source=cutstudio/);
  await expect(page.getByLabel("CutStudio handoff")).toBeVisible();
  await expect(page.getByPlaceholder("What do you want to share?")).toHaveValue(/Create once, distribute everywhere/);
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Publish now" }).click();
  const queueItem = page.locator("article").filter({ hasText: "Create once, distribute everywhere" });
  await expect(queueItem).toContainText("published");
  await expect(queueItem.getByRole("button", { name: "Open source edit" })).toBeVisible();
  const nativeDelivery = (await (await api(page, owner, "GET", "/api/distribution-jobs")).json()).find((item: { content: string }) => item.content.startsWith("Create once, distribute everywhere"));
  const nativePostId = nativeDelivery.deliveries.find((item: { provider: string }) => item.provider === "creativesos").providerContentId;
  await queueItem.getByRole("button", { name: "Automate comments" }).click();
  await expect(page).toHaveURL(new RegExp(`/automations\\?.*post=${nativePostId}`));
  await expect(page.getByText(`Published post ${nativePostId}`, { exact: false })).toBeVisible();
  await expect(page.getByLabel("Post ID", { exact: false })).toHaveValue(String(nativePostId));
  await page.getByRole("textbox", { name: "Keywords", exact: true }).fill("GUIDE");
  await page.getByRole("textbox", { name: "Direct-message reply", exact: true }).fill("Here is the connected creation guide.");
  await page.getByRole("button", { name: "Create keyword automation" }).click();
  await expect(page.getByRole("button", { name: "Activate", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const commentResponse = await api(page, peer, "POST", "/api/comments", { postId: Number(nativePostId), content: "GUIDE" });
  await expectOk(commentResponse);
  const comment = await commentResponse.json();
  await expect.poll(async () => {
    const replies = await api(page, owner, "GET", `/api/comments/${comment.id}/replies`);
    await expectOk(replies);
    return (await replies.json()).some((item: { userId: number; content: string }) => item.userId === owner && item.content.includes("sent it to you"));
  }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
  await expect.poll(async () => {
    const conversations = await api(page, peer, "GET", `/api/users/${peer}/conversations`);
    await expectOk(conversations);
    for (const conversation of await conversations.json() as Array<{ id: number }>) {
      const messages = await api(page, peer, "GET", `/api/conversations/${conversation.id}/messages`);
      if (messages.ok() && (await messages.json()).some((item: { content: string }) => item.content === "Here is the connected creation guide.")) return true;
    }
    return false;
  }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
  await page.goto(`/posts/${nativePostId}/analytics`);
  await expect(page.getByRole("heading", { name: "Post performance" })).toBeVisible();
  await expect(page.getByText("Performance notes", { exact: true })).toBeVisible();
  const analyticsResponse = await api(page, owner, "GET", `/api/posts/${nativePostId}/analytics`);
  await expectOk(analyticsResponse);
  expect(await analyticsResponse.json()).toMatchObject({ comments: expect.any(Number), interactions: expect.any(Number) });
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

  await page.goto(`/broadcast?studio=${studio.id}`);
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

  await page.goto(`/broadcast?studio=${studio.id}`);
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

  await page.goto(`/broadcast?studio=${studio.id}`);
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

  await page.goto(`/broadcast?studio=${created.id}`);
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
  const sourceStudioResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: "Brand source studio" });
  await expectOk(sourceStudioResponse);
  const sourceStudio = await sourceStudioResponse.json();
  await page.goto(`/broadcast?studio=${sourceStudio.id}`);
  await expect(page.getByRole("heading", { name: "Brand source studio" })).toBeVisible();
  await page.getByLabel("Surface brand color").fill("#112233");
  await page.getByLabel("Brand kit name").fill("Operator brand kit");
  await page.getByRole("button", { name: "Save brand kit" }).click();
  await expect(page.getByRole("button", { name: "Apply Operator brand kit brand kit" })).toBeVisible();

  const destinationStudioResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: "Brand destination studio" });
  await expectOk(destinationStudioResponse);
  const destinationStudio = await destinationStudioResponse.json();
  await page.goto(`/broadcast?studio=${destinationStudio.id}`);
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
  await page.goto(`/broadcast?studio=${second.id}`);
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
  const createdResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: "Field managed studio" });
  await expectOk(createdResponse);
  const created = await createdResponse.json() as { id: string };
  await page.goto(`/broadcast?studio=${created.id}`);
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
  const created = await createdResponse.json();
  await page.goto(`/broadcast?studio=${created.id}`);
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

test("Broadcast securely pairs, directs, monitors, and revokes a field capture node", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const owner = ownerFor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const studioResponse = await api(page, owner, "POST", "/api/broadcast/studios", { name: `IRL field studio ${Date.now()}` });
  await expectOk(studioResponse);
  const studio = await studioResponse.json();

  expect((await api(page, peer, "POST", `/api/broadcast/studios/${studio.id}/capture-invitations`, { expiresInMinutes: 15 })).status()).toBe(404);
  const invitationResponse = await api(page, owner, "POST", `/api/broadcast/studios/${studio.id}/capture-invitations`, { expiresInMinutes: 15 });
  await expectOk(invitationResponse);
  const invitation = await invitationResponse.json() as { token: string; claimUrl: string; fieldUrl: string };
  expect(invitation).toMatchObject({ token: expect.any(String), claimUrl: expect.stringContaining("/api/broadcast/capture/claim"), fieldUrl: expect.stringContaining("/broadcast/field?token=") });

  const claimResponse = await page.request.post("/api/broadcast/capture/claim", { data: {
    token: invitation.token,
    name: "Android field camera",
    kind: "android",
    capabilities: {
      transports: ["srt", "whip", "rtmps"], videoCodecs: ["h264", "h265"], maxWidth: 3840, maxHeight: 2160, maxFps: 60,
      cameraCount: 3, audioInputCount: 2, hardwareEncoding: true, localRecording: true, backgroundCapture: true,
      screenCapture: true, adaptiveBitrate: true, connectionBonding: true, talkback: true, remoteControl: true,
    },
  } });
  await expectOk(claimResponse);
  const claim = await claimResponse.json() as { node: { id: string }; deviceSecret: string };
  expect(claim.deviceSecret).toHaveLength(43);
  expect((await page.request.post("/api/broadcast/capture/claim", { data: { token: invitation.token, name: "Replay", kind: "android", capabilities: { transports: ["srt"], videoCodecs: ["h264"], maxWidth: 1920, maxHeight: 1080, maxFps: 30 } } })).status()).toBe(410);

  const telemetry = {
    sequence: 1,
    capturedAt: new Date().toISOString(),
    state: "live",
    links: [
      { id: "wifi", type: "wifi", active: true, uplinkKbps: 7_000, rttMs: 45, jitterMs: 7, packetLossPct: 0.2 },
      { id: "5g", type: "cellular", active: true, uplinkKbps: 4_000, rttMs: 92, jitterMs: 15, packetLossPct: 0.8 },
    ],
    encoder: { videoBitrateKbps: 4_500, audioBitrateKbps: 128, fps: 30, droppedFrames: 2, encodedFrames: 2_000, queueMs: 18 },
    device: { batteryPct: 71, charging: false, thermalState: "nominal", availableStorageMb: 18_000 },
    recording: { active: true, pendingSegments: 0, durationMs: 66_000 },
  };
  const telemetryResponse = await page.request.post(`/api/broadcast/capture/nodes/${claim.node.id}/telemetry`, { headers: { authorization: `Bearer ${claim.deviceSecret}` }, data: telemetry });
  await expectOk(telemetryResponse);
  expect(await telemetryResponse.json()).toMatchObject({ acceptedSequence: 1, status: "live", directive: { reason: "stable", width: 1920, height: 1080, fps: 30, disconnectSlate: true } });
  expect((await page.request.post(`/api/broadcast/capture/nodes/${claim.node.id}/telemetry`, { headers: { authorization: `Bearer ${claim.deviceSecret}` }, data: telemetry })).status()).toBe(409);
  const invalidDeviceSecret = ["invalid", "capture", "credential"].join("-");
  expect((await page.request.get(`/api/broadcast/capture/nodes/${claim.node.id}/configuration`, { headers: { authorization: `Bearer ${invalidDeviceSecret}` } })).status()).toBe(401);

  const nodesResponse = await api(page, owner, "GET", `/api/broadcast/studios/${studio.id}/capture-nodes`);
  await expectOk(nodesResponse);
  const nodes = await nodesResponse.json();
  expect(nodes).toEqual([expect.objectContaining({ id: claim.node.id, name: "Android field camera", kind: "android", status: "live", lastSequence: 1 })]);
  expect(nodes[0]).not.toHaveProperty("deviceSecretHash");
  expect((await api(page, peer, "GET", `/api/broadcast/studios/${studio.id}/capture-nodes`)).status()).toBe(404);

  const configuredResponse = await api(page, owner, "PATCH", `/api/broadcast/studios/${studio.id}/capture-nodes/${claim.node.id}`, {
    configuration: {
      ...nodes[0].configuration,
      requestedState: "standby",
      cameraFacing: "front",
      cameraLens: "wide",
      torchEnabled: true,
      microphoneMuted: true,
      localRecordingEnabled: true,
      recordingSegmentSeconds: 120,
      locationSharing: "approximate",
    },
  });
  await expectOk(configuredResponse);
  expect(await configuredResponse.json()).toMatchObject({ configuration: { requestedState: "standby", cameraFacing: "front", cameraLens: "wide", torchEnabled: true, microphoneMuted: true, locationSharing: "approximate" } });
  expect((await api(page, peer, "PATCH", `/api/broadcast/studios/${studio.id}/capture-nodes/${claim.node.id}`, { configuration: nodes[0].configuration })).status()).toBe(404);

  const configurationResponse = await page.request.get(`/api/broadcast/capture/nodes/${claim.node.id}/configuration`, { headers: { authorization: `Bearer ${claim.deviceSecret}` } });
  await expectOk(configurationResponse);
  expect(await configurationResponse.json()).toMatchObject({ nodeId: claim.node.id, configuration: { requestedState: "standby", cameraFacing: "front", cameraLens: "wide", microphoneMuted: true, locationSharing: "approximate" } });

  await page.goto(`/broadcast?studio=${studio.id}`);
  await expect(page.getByText("Field capture", { exact: true })).toBeVisible();
  await expect(page.getByText("Android field camera", { exact: true })).toBeVisible();
  await expect(page.getByText(/11 Mbps uplink/)).toBeVisible();
  await expect(page.getByText(/Director: 1920×1080/)).toBeVisible();
  await expect(page.getByLabel("Android field camera director state")).toHaveValue("standby");
  await page.getByLabel("Android field camera director state").selectOption("live");
  await expect(page.getByText("Android field camera was directed to live.")).toBeVisible();
  await expect(page.getByLabel("Android field camera director state")).toHaveValue("live");

  const revokeResponse = await api(page, owner, "DELETE", `/api/broadcast/studios/${studio.id}/capture-nodes/${claim.node.id}`);
  expect(revokeResponse.status()).toBe(204);
  expect((await page.request.post(`/api/broadcast/capture/nodes/${claim.node.id}/telemetry`, { headers: { authorization: `Bearer ${claim.deviceSecret}` }, data: { ...telemetry, sequence: 2 } })).status()).toBe(401);
});
