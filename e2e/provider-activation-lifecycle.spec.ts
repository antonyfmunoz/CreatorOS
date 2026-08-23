import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { providerActivationStages } from "../shared/provider-activation";

function actor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

function api(page: Page, userId: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(userId) } });
}

test("provider activation remains tenant-scoped, evidence-led, and impossible to qualify early", async ({ page }, testInfo) => {
  const owner = actor(testInfo);
  const outsider = owner === 1 ? 2 : 1;
  expect((await api(page, owner, "POST", "/api/provider-activations/runs/not-a-uuid/complete")).status()).toBe(400);
  const created = await api(page, owner, "POST", "/api/provider-activations/media_delivery/runs", { environment: "production", summary: "Production media provider qualification" });
  expect(created.status(), await created.text()).toBe(201);
  const run = await created.json();

  const disposable = await api(page, owner, "POST", "/api/provider-activations/media_delivery/runs", { environment: "sandbox", summary: "Disposable sandbox activation run" });
  expect(disposable.status()).toBe(201);
  const abandoned = await api(page, owner, "POST", `/api/provider-activations/runs/${(await disposable.json()).id}/abandon`);
  expect(abandoned.ok(), await abandoned.text()).toBeTruthy();
  expect(await abandoned.json()).toMatchObject({ status: "abandoned", abandonedAt: expect.any(String), closedByUserId: owner });

  const premature = await api(page, owner, "POST", `/api/provider-activations/runs/${run.id}/complete`);
  expect(premature.status()).toBe(409);
  expect(await premature.json()).toMatchObject({ qualification: { qualifiable: false, missing: providerActivationStages } });

  const outsiderDashboard = await api(page, outsider, "GET", "/api/provider-activations");
  expect(outsiderDashboard.ok()).toBeTruthy();
  expect((await outsiderDashboard.json()).runs.some((candidate: { id: string }) => candidate.id === run.id)).toBe(false);
  const outsiderWrite = await api(page, outsider, "POST", `/api/provider-activations/runs/${run.id}/evidence`, { stage: "connect", outcome: "blocked", summary: "Tenant isolation qualification should reject this evidence." });
  expect(outsiderWrite.status()).toBe(404);

  const supersededFailure = await api(page, owner, "POST", `/api/provider-activations/runs/${run.id}/evidence`, {
    stage: "connect",
    outcome: "failed",
    summary: "Initial connection attempt failed and must be superseded by the later controlled retest.",
  });
  expect(supersededFailure.status(), await supersededFailure.text()).toBe(201);

  for (const stage of providerActivationStages) {
    const recorded = await api(page, owner, "POST", `/api/provider-activations/runs/${run.id}/evidence`, {
      stage,
      outcome: "passed",
      evidenceUrl: `https://evidence.example/media-delivery/${stage}`,
      summary: `${stage} passed the controlled production field-test protocol.`,
    });
    expect(recorded.status(), `${stage}: ${await recorded.text()}`).toBe(201);
  }

  const completed = await api(page, owner, "POST", `/api/provider-activations/runs/${run.id}/complete`);
  expect(completed.ok(), await completed.text()).toBeTruthy();
  expect(await completed.json()).toMatchObject({ status: "qualified", qualification: { state: "qualified", qualifiable: true, progressBps: 10_000 } });
  const immutable = await api(page, owner, "POST", `/api/provider-activations/runs/${run.id}/evidence`, { stage: "connect", outcome: "failed", summary: "Closed runs must reject all later evidence mutations." });
  expect(immutable.status()).toBe(409);

  await page.goto("/business/providers");
  await expect(page.getByRole("heading", { name: "Provider activation control plane" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Media processing and delivery/ })).toContainText("qualified");
  await expect(page.getByText("100% current passing evidence")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
