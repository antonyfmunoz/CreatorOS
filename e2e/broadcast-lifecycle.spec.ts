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
  await page.getByRole("button", { name: "Lower third", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lower third", exact: true })).toHaveCount(2);
  await page.getByLabel("Scene template").selectOption("interview");
  await page.getByRole("button", { name: "Add template" }).click();
  await expect(page.getByRole("button", { name: /Two-person interview/ })).toBeVisible();
  await page.getByLabel("Surface brand color").fill("#112233");
  await page.getByRole("button", { name: "Apply to branded graphics" }).click();
  await expect(page.getByText(/Operator keys:/)).toBeVisible();
  await page.getByLabel("Broadcast resolution").selectOption("1080x1920");
  await expect(page.getByLabel("Broadcast resolution")).toHaveValue("1080x1920");
});
