import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

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
  await expect(page.getByLabel("Host camera compressor")).toBeChecked();
  await expect(page.getByLabel("Host camera audio monitoring")).toBeChecked();
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
  expect(persistedStudios.some((studio: { config?: { scenes?: Array<{ sources?: Array<{ name: string; audioProcessing?: { compressor: boolean; monitor: boolean } }> }> } }) =>
    studio.config?.scenes?.some((scene) => scene.sources?.some((source) => source.name === "Host camera" && source.audioProcessing?.compressor && source.audioProcessing.monitor)),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenes?: Array<{ sources?: Array<{ name: string; chromaKey?: { enabled: boolean; color: string } }> }> } }) =>
    studio.config?.scenes?.some((scene) => scene.sources?.some((source) => source.name === "Host camera" && source.chromaKey?.enabled && source.chromaKey.color === "#00ee22")),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenes?: Array<{ sources?: Array<{ name: string; presentation?: { animation: string } }> }> } }) =>
    studio.config?.scenes?.some((scene) => scene.sources?.some((source) => source.name === "Lower third" && source.presentation?.animation === "fade")),
  )).toBe(true);
  expect(persistedStudios.some((studio: { config?: { scenePresets?: Array<{ name: string }> } }) => studio.config?.scenePresets?.some((preset) => preset.name === "Weekly show"))).toBe(true);

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
  await page.getByLabel("Broadcast studio").selectOption({ label: "Brand destination studio" });
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
