import { expect, test, type Page, type TestInfo } from "@playwright/test";
function actor(testInfo: TestInfo) { return testInfo.project.name.startsWith("mobile") ? 1 : 2; }
async function api(page: Page, testInfo: TestInfo, method: string, url: string, data?: unknown) { return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor(testInfo)) } }); }

test("OAuth apps install with explicit scopes, one-time codes, and immediate revocation", async ({ page }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const origin = new URL((await page.request.get("/api/health")).url()).origin;
  const redirectUri = `${origin}/api/qualification/oauth-callback`;
  const created = await api(page, testInfo, "POST", "/api/developer/oauth-apps", { name: `Qualified OAuth ${stamp}`, redirectUris: [redirectUri], scopes: ["profile:read", "products:read"] });
  expect(created.ok(), await created.text()).toBeTruthy();
  const app = await created.json(); expect(app.clientSecret).toMatch(/^cos_secret_/);
  const authorize = await api(page, testInfo, "POST", "/api/oauth/authorize", { clientId: app.app.clientId, redirectUri, scopes: ["profile:read"], state: `state-${stamp}` });
  expect(authorize.status()).toBe(201);
  const redirect = new URL((await authorize.json()).redirectUrl);
  expect(redirect.searchParams.get("state")).toBe(`state-${stamp}`);
  const code = redirect.searchParams.get("code"); expect(code).toMatch(/^cos_code_/);
  const token = await page.request.post("/oauth/token", { data: { grant_type: "authorization_code", client_id: app.app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri } });
  expect(token.ok(), await token.text()).toBeTruthy();
  const access = await token.json(); expect(access.access_token).toMatch(/^cos_oauth_/); expect(access.refresh_token).toMatch(/^cos_refresh_/); expect(access.scope).toBe("profile:read");
  expect((await page.request.get("/api/v1/profile", { headers: { authorization: `Bearer ${access.access_token}` } })).ok()).toBeTruthy();
  expect((await page.request.get("/api/v1/products", { headers: { authorization: `Bearer ${access.access_token}` } })).status()).toBe(403);
  expect((await page.request.post("/oauth/token", { data: { grant_type: "authorization_code", client_id: app.app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri } })).status()).toBe(400);
  const refreshed = await page.request.post("/oauth/token", { data: { grant_type: "refresh_token", client_id: app.app.clientId, client_secret: app.clientSecret, refresh_token: access.refresh_token } });
  expect(refreshed.ok(), await refreshed.text()).toBeTruthy();
  const rotated = await refreshed.json(); expect(rotated.refresh_token).not.toBe(access.refresh_token);
  expect((await page.request.get("/api/v1/profile", { headers: { authorization: `Bearer ${rotated.access_token}` } })).ok()).toBeTruthy();
  expect((await page.request.post("/oauth/token", { data: { grant_type: "refresh_token", client_id: app.app.clientId, client_secret: app.clientSecret, refresh_token: access.refresh_token } })).status()).toBe(400);
  expect((await page.request.get("/api/v1/profile", { headers: { authorization: `Bearer ${rotated.access_token}` } })).status()).toBe(401);
  const dashboard = await api(page, testInfo, "GET", "/api/developer"); const body = await dashboard.json();
  expect(JSON.stringify(body)).not.toContain(app.clientSecret); expect(body.oauthApps.some((item: { id: string }) => item.id === app.app.id)).toBe(true);
  const installation = body.installations.find((item: { app: { id: string } }) => item.app.id === app.app.id).installation;
  expect((await api(page, testInfo, "DELETE", `/api/developer/installations/${installation.id}`)).status()).toBe(204);
  expect((await page.request.get("/api/v1/profile", { headers: { authorization: `Bearer ${access.access_token}` } })).status()).toBe(401);
  await page.goto("/business/developer"); await expect(page.getByTestId("developer-oauth-apps")).toContainText(`Qualified OAuth ${stamp}`);
  expect((await api(page, testInfo, "DELETE", `/api/developer/oauth-apps/${app.app.id}`)).status()).toBe(204);
});
