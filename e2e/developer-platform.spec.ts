import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return { owner, other: owner === 1 ? 2 : 1 };
}
async function api(
  page: Page,
  actor: number,
  method: string,
  url: string,
  data?: unknown,
) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(actor) },
  });
}
async function ok(response: APIResponse) {
  expect(
    response.ok(),
    `${response.status()} ${response.url()}: ${await response.text()}`,
  ).toBeTruthy();
}

test("scoped API keys and signed webhooks are tenant-safe, retry-safe, and revocable", async ({
  page,
}, testInfo) => {
  const { owner, other } = actors(testInfo);
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const keyResponse = await api(page, owner, "POST", "/api/developer/keys", {
    name: `Read API ${stamp}`,
    scopes: ["profile:read", "products:read"],
  });
  await ok(keyResponse);
  const keyResult = await keyResponse.json();
  expect(keyResult.secret).toMatch(/^cos_/);
  expect((await page.request.get("/api/v1/profile")).status()).toBe(401);
  const profile = await page.request.get("/api/v1/profile", {
    headers: {
      authorization: `Bearer ${keyResult.secret}`,
      "x-request-id": `qualified-${stamp}`,
    },
  });
  await ok(profile);
  expect(profile.headers()["x-request-id"]).toBe(`qualified-${stamp}`);
  expect(profile.headers()["x-ratelimit-limit"]).toBe("120");
  expect(
    (
      await page.request.get("/api/v1/assets", {
        headers: { authorization: `Bearer ${keyResult.secret}` },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get("/api/v1/products?cursor=not-valid", {
        headers: { authorization: `Bearer ${keyResult.secret}` },
      })
    ).status(),
  ).toBe(400);

  const dashboardResponse = await api(page, owner, "GET", "/api/developer");
  await ok(dashboardResponse);
  const dashboardText = await dashboardResponse.text();
  expect(dashboardText).not.toContain(keyResult.secret);
  expect(dashboardText).not.toContain("keyHash");
  expect(
    (
      await api(
        page,
        other,
        "DELETE",
        `/api/developer/keys/${keyResult.key.id}`,
      )
    ).status(),
  ).toBe(404);

  const health = await page.request.get("/api/health");
  const origin = new URL(health.url()).origin;
  expect(
    (
      await api(page, owner, "POST", "/api/developer/webhooks", {
        name: "Unsafe local endpoint",
        url: "https://127.0.0.1/private",
        events: ["test.ping"],
      })
    ).status(),
  ).toBe(400);
  const endpointResponse = await api(
    page,
    owner,
    "POST",
    "/api/developer/webhooks",
    {
      name: `Qualified sink ${stamp}`,
      url: `${origin}/api/qualification/developer-webhook-sink`,
      events: ["test.ping"],
    },
  );
  await ok(endpointResponse);
  const endpointResult = await endpointResponse.json();
  expect(endpointResult.signingSecret).toMatch(/^whsec_/);
  const testDelivery = await api(
    page,
    owner,
    "POST",
    `/api/developer/webhooks/${endpointResult.endpoint.id}/test`,
    {},
  );
  await ok(testDelivery);
  expect((await testDelivery.json()).delivery).toMatchObject({
    status: "delivered",
    attempt: 1,
    responseCode: 204,
  });

  await page.goto("/business/developer");
  await expect(
    page.getByRole("heading", { name: "Developer platform" }),
  ).toBeVisible();
  await expect(page.getByTestId("developer-api-keys")).toContainText(
    `Read API ${stamp}`,
  );
  await expect(page.getByTestId("developer-webhooks")).toContainText(
    `Qualified sink ${stamp}`,
  );

  await ok(
    await api(
      page,
      owner,
      "DELETE",
      `/api/developer/webhooks/${endpointResult.endpoint.id}`,
    ),
  );
  await ok(
    await api(page, owner, "DELETE", `/api/developer/keys/${keyResult.key.id}`),
  );
  expect(
    (
      await page.request.get("/api/v1/profile", {
        headers: { authorization: `Bearer ${keyResult.secret}` },
      })
    ).status(),
  ).toBe(401);
});
