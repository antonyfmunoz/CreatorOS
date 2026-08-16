import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

function actor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

function api(page: Page, userId: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(userId) },
  });
}

test("mobile device registration is owner-scoped, redacted, rotatable and revocable", async ({ page }, testInfo) => {
  const owner = actor(testInfo);
  const outsider = owner === 1 ? 2 : 1;
  const installationId = randomUUID();
  const initialToken = `qualification-${randomUUID()}-${randomUUID()}`;

  const registered = await api(page, owner, "POST", "/api/mobile/devices", {
    installationId,
    platform: "android",
    provider: "fcm",
    pushToken: initialToken,
    appVersion: "qualification (1)",
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const registeredBody = await registered.json();
  expect(registeredBody).toMatchObject({
    device: { installationId, platform: "android", provider: "fcm", status: "active" },
  });
  expect(JSON.stringify(registeredBody)).not.toContain(initialToken);
  expect(registeredBody.device).not.toHaveProperty("pushTokenHash");
  expect(registeredBody.device).not.toHaveProperty("pushTokenCiphertext");

  const ownerList = await api(page, owner, "GET", "/api/mobile/devices");
  expect(ownerList.ok(), await ownerList.text()).toBeTruthy();
  expect(await ownerList.json()).toMatchObject({ devices: [{ installationId, status: "active" }] });
  const outsiderList = await api(page, outsider, "GET", "/api/mobile/devices");
  expect(outsiderList.ok()).toBeTruthy();
  expect(
    (await outsiderList.json()).devices.some(
      (device: { installationId: string }) => device.installationId === installationId,
    ),
  ).toBe(false);

  const outsiderDelete = await api(page, outsider, "DELETE", `/api/mobile/devices/${installationId}`);
  expect(outsiderDelete.status()).toBe(404);

  const rotatedToken = `qualification-${randomUUID()}-${randomUUID()}`;
  const rotated = await api(page, owner, "POST", "/api/mobile/devices", {
    installationId,
    platform: "android",
    provider: "fcm",
    pushToken: rotatedToken,
    appVersion: "qualification (2)",
  });
  expect(rotated.status(), await rotated.text()).toBe(201);
  expect(await rotated.json()).toMatchObject({ device: { installationId, appVersion: "qualification (2)", status: "active" } });

  const revoked = await api(page, owner, "DELETE", `/api/mobile/devices/${installationId}`);
  expect(revoked.ok(), await revoked.text()).toBeTruthy();
  expect(await revoked.json()).toMatchObject({ device: { installationId, status: "revoked" } });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("This mobile device")).toHaveCount(0);
});
