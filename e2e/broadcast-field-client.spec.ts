import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function ownerFor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

async function ownerApi(page: Page, owner: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(owner) } });
}

test("Broadcast Field securely pairs a browser camera and obeys director control", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
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
          context.fillStyle = "#1d9bf0";
          context.fillRect(0, 0, canvas.width, canvas.height);
          return canvas.captureStream(15);
        },
        getDisplayMedia: async () => { throw new Error("Screen consent was not granted in this test"); },
      },
    });
  });

  const studioResponse = await ownerApi(page, owner, "POST", "/api/broadcast/studios", { name: `Browser field studio ${Date.now()}` });
  await expectOk(studioResponse);
  const studio = await studioResponse.json() as { id: string };
  const invitationResponse = await ownerApi(page, owner, "POST", `/api/broadcast/studios/${studio.id}/capture-invitations`, { expiresInMinutes: 15 });
  await expectOk(invitationResponse);
  const invitation = await invitationResponse.json() as { fieldUrl: string };
  expect(invitation.fieldUrl).toContain("/broadcast/field?token=");

  await page.goto(invitation.fieldUrl);
  await expect(page.getByRole("heading", { name: "Pair this field camera" })).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
  await page.getByLabel("Device name").fill("Browser qualification camera");
  await page.getByRole("button", { name: "Pair securely" }).click();
  await expect(page.getByText(/securely paired/)).toBeVisible();
  await expect(page.getByText("Director linked")).toBeVisible();
  await page.getByRole("button", { name: "Start preview" }).click();
  await expect(page.locator("video")).toBeVisible();

  const nodesResponse = await ownerApi(page, owner, "GET", `/api/broadcast/studios/${studio.id}/capture-nodes`);
  await expectOk(nodesResponse);
  const [node] = await nodesResponse.json() as Array<{ id: string; configuration: Record<string, unknown> }>;
  const configurationResponse = await ownerApi(page, owner, "PATCH", `/api/broadcast/studios/${studio.id}/capture-nodes/${node.id}`, {
    configuration: { ...node.configuration, requestedState: "live", microphoneMuted: true },
  });
  await expectOk(configurationResponse);
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Muted", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await ownerApi(page, owner, "GET", `/api/broadcast/studios/${studio.id}/capture-nodes`);
    await expectOk(response);
    return (await response.json())[0]?.status;
  }).toBe("live");

  expect((await ownerApi(page, owner, "DELETE", `/api/broadcast/studios/${studio.id}/capture-nodes/${node.id}`)).status()).toBe(204);
  await expect(page.getByText(/director revoked this device/i)).toBeVisible({ timeout: 15_000 });
});
