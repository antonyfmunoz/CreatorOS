import { expect, test, type Page, type TestInfo } from "@playwright/test";
function owner(testInfo: TestInfo) { return testInfo.project.name.startsWith("mobile") ? 1 : 2; }
async function api(page: Page, actor: number, method: string, url: string, data?: unknown) { return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor) } }); }

test("reviewed apps publish safely and expiring sandboxes isolate credentials", async ({ page }, testInfo) => {
  const actor = owner(testInfo); const stamp = `${testInfo.project.name}-${Date.now()}`;
  const created = await api(page, actor, "POST", "/api/developer/oauth-apps", { name: `Marketplace ${stamp}`, redirectUris: ["https://app.example.com/oauth/callback"], scopes: ["profile:read"] });
  expect(created.ok(), await created.text()).toBeTruthy(); const app = await created.json();
  expect((await api(page, actor, "PUT", `/api/developer/oauth-apps/${app.app.id}/listing`, { description: "A governed reporting integration for qualified CreativesOS businesses.", homepageUrl: "https://app.example.com", privacyUrl: "https://app.example.com/privacy", termsUrl: "https://app.example.com/terms" })).ok()).toBeTruthy();
  expect((await api(page, actor, "POST", `/api/developer/oauth-apps/${app.app.id}/submit`, {})).status()).toBe(202);
  expect((await api(page, actor, "POST", `/api/admin/developer/apps/${app.app.id}/review`, { decision: "approved", note: "Owner cannot approve" })).status()).toBe(403);
  const queue = await api(page, 3, "GET", "/api/admin/developer/apps"); expect((await queue.json()).some((item: { id: string }) => item.id === app.app.id)).toBe(true);
  const review = await api(page, 3, "POST", `/api/admin/developer/apps/${app.app.id}/review`, { decision: "approved", note: "Scope and policy review passed" }); expect(review.ok(), await review.text()).toBeTruthy();
  await page.setExtraHTTPHeaders({ "x-creativesos-demo-user": "3" });
  await page.goto("/admin/apps");
  await expect(page.getByRole("heading", { name: "App review" })).toBeVisible();
  await page.setExtraHTTPHeaders({ "x-creativesos-demo-user": String(actor) });
  const publicApps = await page.request.get("/api/apps"); const listings = await publicApps.json(); expect(listings.some((item: { id: string }) => item.id === app.app.id)).toBe(true);
  const sandboxResponse = await api(page, actor, "POST", `/api/developer/oauth-apps/${app.app.id}/sandboxes`, {}); expect(sandboxResponse.status()).toBe(201);
  const sandbox = await sandboxResponse.json(); expect(sandbox.apiKey).toMatch(/^cos_/);
  const sandboxProfile = await page.request.get("/api/v1/profile", { headers: { authorization: `Bearer ${sandbox.apiKey}` } }); expect(sandboxProfile.ok()).toBeTruthy(); expect((await sandboxProfile.json()).data.name).toContain("Sandbox");
  const dashboard = await api(page, actor, "GET", "/api/developer"); const dashboardText = await dashboard.text(); expect(dashboardText).not.toContain(sandbox.apiKey); expect(JSON.parse(dashboardText).sandboxes.some((item: { sandbox: { id: string } }) => item.sandbox.id === sandbox.sandbox.id)).toBe(true);
  await page.goto("/apps"); await expect(page.getByRole("heading", { name: "CreativesOS Apps" })).toBeVisible(); await expect(page.getByText(`Marketplace ${stamp}`, { exact: true })).toBeVisible();
  expect((await api(page, actor, "DELETE", `/api/developer/sandboxes/${sandbox.sandbox.id}`)).status()).toBe(204);
  expect((await page.request.get("/api/v1/profile", { headers: { authorization: `Bearer ${sandbox.apiKey}` } })).status()).toBe(401);
  expect((await api(page, actor, "DELETE", `/api/developer/oauth-apps/${app.app.id}`)).status()).toBe(204);
});
