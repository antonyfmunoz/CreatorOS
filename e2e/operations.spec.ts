import { expect, test, type Page, type TestInfo } from "@playwright/test";

function actor(testInfo: TestInfo) { return testInfo.project.name.startsWith("mobile") ? 1 : 2; }
async function request(page: Page, testInfo: TestInfo, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor(testInfo)) } });
}

test("operations evidence remains honest and cost boundaries persist", async ({ page }, testInfo) => {
  const releaseResponse = await request(page, testInfo, "GET", "/api/release");
  expect(releaseResponse.status()).toBe(200);
  const release = await releaseResponse.json();
  expect(release).toMatchObject({
    status: "verified",
    app: "creativesos",
    build: { identityVerified: true },
    migrations: {
      parity: true,
    },
  });
  expect(release.migrations.expected).toEqual(release.migrations.actual);
  expect(release.migrations.actual.count).toBeGreaterThan(0);

  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const event = await request(page, testInfo, "POST", "/api/qualification/operations/event", {
    service: "commerce", success: false, durationMs: 2750, statusCode: 503,
    sourceId: `failure-${stamp}`, estimatedCostMicros: 125_000,
  });
  expect(event.status()).toBe(201);
  const budget = await request(page, testInfo, "PUT", "/api/operations/budgets/commerce", {
    softLimitMicros: 100_000, hardLimitMicros: 200_000, enabled: true,
  });
  expect(budget.ok()).toBeTruthy();
  const dashboard = await request(page, testInfo, "GET", "/api/operations");
  expect(dashboard.ok()).toBeTruthy();
  const body = await dashboard.json();
  const commerce = body.services.find((item: { service: string }) => item.service === "commerce");
  expect(commerce.observed.total).toBeGreaterThan(0);
  expect(commerce.observed.failed).toBeGreaterThan(0);
  expect(commerce.usage.estimatedCostMicros).toBeGreaterThanOrEqual(125_000);
  expect(commerce.budgetState).toBe("soft_limit");
  const realtime = body.services.find(
    (item: { service: string }) => item.service === "realtime",
  );
  if (realtime.observed.total === 0) {
    expect(realtime.observed.errorBudget.state).toBe("unmeasured");
  } else {
    expect(["healthy", "exhausted"]).toContain(
      realtime.observed.errorBudget.state,
    );
  }
  await page.goto("/business/operations");
  await expect(page.getByRole("heading", { name: "Operations control plane" })).toBeVisible();
  await expect(page.getByText("Media playback", { exact: true })).toBeVisible();
  await expect(page.getByText("Commerce", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
