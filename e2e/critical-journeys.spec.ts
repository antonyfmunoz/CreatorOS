import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function watchRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
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
