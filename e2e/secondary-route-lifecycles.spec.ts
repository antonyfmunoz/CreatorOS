import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function owner(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

async function api(page: Page, actor: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(actor) },
  });
}

async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

test("secondary navigation and trust routes preserve their intended behavior", async ({ page }) => {
  for (const path of [
    "/api/broadcast/sessions/not-a-uuid/audience",
    "/api/cut/workspace/projects/not-a-uuid",
    "/api/design/not-a-uuid",
    "/api/public/events/not-a-uuid/tickets",
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  expect((await page.request.get("/api/health")).ok()).toBe(true);

  await page.goto("/checkout/success");
  await expect(page.getByRole("heading", { name: "Checkout session not found" })).toBeVisible();
  await page.getByRole("button", { name: "Return to cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);

  await page.goto("/revenue");
  await expect(page).toHaveURL(/\/earnings$/);

  for (const [path, heading] of [
    ["/legal/data-deletion", "Account data deletion"],
    ["/legal/community-guidelines", "Community guidelines"],
    ["/legal/ai-recording", "AI, recording, and synthetic media policy"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  for (const path of ["/followers/2", "/user/sarahmitchell/followers"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Followers", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Search followers")).toBeVisible();
  }
  for (const path of ["/following/2", "/user/sarahmitchell/following"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Following", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Search following")).toBeVisible();
  }
});

test("an owner can edit and republish an offer through the browser", async ({ page }, testInfo) => {
  const actor = owner(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const createdResponse = await api(page, actor, "POST", "/api/products", {
    title: `Editable offer ${marker}`,
    description: "A browser-qualified editable offer.",
    price: 12,
    category: "Digital Asset",
    imageUrl: null,
    productType: "digital_download",
    billingModel: "one_time",
  });
  await expectOk(createdResponse);
  const created = await createdResponse.json() as { id: number };
  const publishedTitle = `Republished offer ${marker}`;

  await page.goto(`/products/${created.id}/edit`);
  await expect(page.getByRole("heading", { name: "Edit offer" })).toBeVisible();
  await page.getByLabel("Publishing status").selectOption("published");
  await page.getByLabel("Title").fill(publishedTitle);
  await page.getByRole("button", { name: "Save offer" }).click();

  await expect(page).toHaveURL(new RegExp(`/marketplace/product/${created.id}$`));
  await expect(page.getByRole("heading", { name: publishedTitle })).toBeVisible();
  const persisted = await api(page, actor, "GET", `/api/products/${created.id}/manage`);
  await expectOk(persisted);
  expect(await persisted.json()).toMatchObject({ title: publishedTitle, status: "published" });
});
