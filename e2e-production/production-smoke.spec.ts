import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function runtimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`page:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) failures.push(`console:${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`http:${response.status()} ${new URL(response.url()).pathname}`);
  });
  return failures;
}

test("@public immutable production identity, readiness, and auth entry are healthy", async ({ page, request }) => {
  const [releaseResponse, healthResponse, readyResponse] = await Promise.all([
    request.get("/api/release"),
    request.get("/api/health"),
    request.get("/api/ready"),
  ]);
  expect(releaseResponse.ok()).toBeTruthy();
  expect(healthResponse.ok()).toBeTruthy();
  expect(readyResponse.ok()).toBeTruthy();
  const release = await releaseResponse.json();
  const ready = await readyResponse.json();
  expect(release).toMatchObject({ status: "verified", build: { sourceDirty: false, identityVerified: true }, migrations: { parity: true } });
  expect(ready).toMatchObject({ status: "ready", release: { status: "release_ready", blockers: [] } });
  const expectedCommit = process.env.CREATIVESOS_EXPECTED_COMMIT?.toLowerCase();
  if (expectedCommit) expect(release.build.sourceCommit).toBe(expectedCommit);

  await page.context().clearCookies();
  await page.goto("/auth/login");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await expect(page.getByText(/CreativesOS/i).first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
});

test("@authenticated production workspaces render without destructive mutations", async ({ page }) => {
  const failures = runtimeFailures(page);
  const routes = [
    "/", "/profile", "/marketplace", "/messages", "/communities", "/create",
    "/business", "/campaigns", "/ugc", "/earnings", "/distribution",
    "/automations", "/cut-studio", "/broadcast", "/settings", "/settings/privacy",
  ];
  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/auth(?:\/|$)/);
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Updating CreativesOS" })).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});
