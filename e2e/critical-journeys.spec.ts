import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function watchRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
  });
  return errors;
}

function watchServerFailures(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return errors;
}

async function expectNoHighImpactAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
}

test("public trust surfaces remain accessible without application navigation", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByRole("heading", { name: "CreativesOS Trust Center" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Trust policies" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await expectNoHighImpactAccessibilityViolations(page);
});

test("primary navigation matches the current destination", async ({ page }) => {
  const runtimeErrors = watchRuntime(page);
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primary).toBeVisible();
  await expect(primary.getByRole("button", { name: "Explore" })).toHaveAttribute("aria-current", "page");

  await primary.getByRole("button", { name: "Marketplace" }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
  await expect(primary.getByRole("button", { name: "Marketplace" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("searchbox", { name: "Search marketplace" })).toBeVisible();

  await primary.getByRole("button", { name: "Communities" }).click();
  await expect(page).toHaveURL(/\/communities$/);
  await expect(primary.getByRole("button", { name: "Communities" })).toHaveAttribute("aria-current", "page");
  expect(runtimeErrors).toEqual([]);
});

test("profile tabs remain clickable after horizontal navigation", async ({ page }) => {
  await page.goto("/profile");
  const profileNav = page.getByRole("navigation", { name: "Profile content" });
  await expect(profileNav).toBeVisible();
  await profileNav.getByRole("button", { name: "Likes" }).click();
  await expect(profileNav.getByRole("button", { name: "Likes" })).toHaveAttribute("aria-current", "page");
  await profileNav.getByRole("button", { name: "Posts", exact: true }).click();
  await expect(profileNav.getByRole("button", { name: "Posts", exact: true })).toHaveAttribute("aria-current", "page");
});

test("account privacy is reachable without performing a destructive action", async ({ page }) => {
  await page.goto("/settings/privacy");
  await expect(page.getByRole("heading", { name: "Data & privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download JSON export" })).toBeVisible();
  const schedule = page.getByRole("button", { name: "Schedule account deletion" });
  await expect(schedule).toBeDisabled();
  await expectNoHighImpactAccessibilityViolations(page);
});

test("core provider-independent workspaces render without route failures", async ({ page }) => {
  const routes = [
    "/",
    "/marketplace",
    "/create",
    "/communities",
    "/profile",
    "/messages",
    "/automations",
    "/business",
    "/campaigns",
    "/earnings",
    "/distribution",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Updating CreativesOS" })).toHaveCount(0);
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(0);
  }
});

test("all static product surfaces render without application or server failure", async ({ page }) => {
  test.setTimeout(150_000);
  const failures = watchServerFailures(page);
  const routes = [
    "/cart",
    "/orders",
    "/learn",
    "/studio",
    "/distribution/connections",
    "/business/approvals",
    "/moderation",
    "/ai",
    "/settings/privacy",
    "/settings",
    "/saved-posts",
    "/followers",
    "/following",
    "/contacts",
    "/documents",
    "/create-product",
    "/create/post",
    "/create/event",
    "/messages",
    "/notifications",
    "/search",
    "/new-text-post",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-content"), `main content for ${route}`).toBeVisible();
    await expect(page.getByRole("heading", { name: "Updating CreativesOS" })).toHaveCount(0);
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});

test("dynamic identity and content routes fail gracefully", async ({ page }) => {
  test.setTimeout(90_000);
  const failures = watchServerFailures(page);
  const routes = [
    "/profile/2",
    "/user/sarahmitchell",
    "/marketplace/product/1",
    "/communities/1",
    "/post/1",
    "/posts/1/analytics",
    "/courses/1/manage",
    "/learn/1",
    "/events/1/edit",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-content"), `main content for ${route}`).toBeVisible();
    await expect(page.getByRole("heading", { name: "Updating CreativesOS" })).toHaveCount(0);
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});

test("a text post persists after publishing and reload", async ({ page }, testInfo) => {
  const failures = watchServerFailures(page);
  const content = `Field-tested post ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/new-text-post");
  await page.getByPlaceholder("What's on your mind?").fill(content);
  await page.getByRole("button", { name: "Share", exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test("profile links can be edited and persist after reload", async ({ page }, testInfo) => {
  const failures = watchServerFailures(page);
  const label = `Portfolio ${testInfo.project.name}`;
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();
  await page.getByRole("button", { name: /Add your website|Add link/ }).first().click();
  await page.getByRole("textbox", { name: "Link 1 label" }).fill(label);
  await page.getByRole("textbox", { name: "Link 1 URL" }).fill("https://creativesos.net");
  const saved = page.waitForResponse((response) => /\/api\/users\/\d+$/.test(new URL(response.url()).pathname) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Done" }).click();
  expect((await saved).status()).toBeLessThan(300);
  await expect(page.getByRole("link", { name: label })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: label })).toBeVisible();
  expect(failures).toEqual([]);
});

test("account settings persist and apply high contrast mode", async ({ page }) => {
  const failures = watchServerFailures(page);
  await page.goto("/settings");
  const push = page.getByRole("switch", { name: "Push notifications" });
  await expect(push).toBeChecked();
  const pushSaved = page.waitForResponse((response) => response.url().endsWith("/api/user/settings") && response.request().method() === "PATCH");
  await push.click();
  expect((await pushSaved).status()).toBeLessThan(300);
  await page.reload();
  await expect(page.getByRole("switch", { name: "Push notifications" })).not.toBeChecked();

  const contrast = page.getByRole("switch", { name: "High-contrast color mode" });
  const contrastSaved = page.waitForResponse((response) => response.url().endsWith("/api/user/settings") && response.request().method() === "PATCH");
  await contrast.click();
  expect((await contrastSaved).status()).toBeLessThan(300);
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "high_contrast");
  expect(failures).toEqual([]);
});

test("marketplace search filters community discovery", async ({ page }) => {
  const failures = watchServerFailures(page);
  await page.goto("/marketplace");
  const marketplace = page.locator("main");
  await marketplace.getByRole("button", { name: "Communities", exact: true }).click();
  const search = marketplace.getByRole("searchbox", { name: "Search marketplace" });
  await search.fill("Web Developers");
  await expect(page.getByRole("heading", { name: "Web Developers" })).toBeVisible();
  await search.fill("no-community-has-this-name");
  await expect(page.getByText("No communities match those filters yet.")).toBeVisible();
  expect(failures).toEqual([]);
});

test("community content remains gated until membership is created", async ({ page }) => {
  const failures = watchServerFailures(page);
  await page.goto("/communities/1");
  const join = page.getByRole("button", { name: "Join community" });
  await expect(join).toBeVisible();
  const joined = page.waitForResponse((response) => response.url().endsWith("/api/communities/1/join") && response.request().method() === "POST");
  await join.click();
  expect((await joined).status()).toBeLessThan(300);
  await expect(page.getByPlaceholder(/Message #general/)).toBeEnabled();
  await page.getByRole("button", { name: "Search community" }).click();
  await expect(page.getByText("Recent messages", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search this channel" }).fill("virtual hackathon");
  const searchResult = page.getByRole("button", { name: /virtual hackathon/i });
  await searchResult.click();
  await expect(searchResult).toHaveAttribute("aria-pressed", "true");
  const message = page.locator('[id^="community-message-"]').filter({ hasText: "virtual hackathon" }).first();
  await message.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Like" })).toBeVisible();
  expect(failures).toEqual([]);
});

test("primary surfaces have no serious accessibility violations", async ({ page }) => {
  test.setTimeout(150_000);
  const routes = ["/", "/marketplace", "/create", "/communities", "/profile", "/messages", "/business", "/automations", "/settings"];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-content")).toBeVisible();
    await expectNoHighImpactAccessibilityViolations(page);
  }
});
