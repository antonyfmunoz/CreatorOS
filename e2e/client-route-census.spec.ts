import { expect, test, type Page } from "@playwright/test";
import { clientRouteQualificationManifest } from "../shared/client-route-qualification";

function runtimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`page:${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("favicon") &&
      !message.text().includes("Failed to load resource: the server responded with a status of")
    ) {
      failures.push(`console:${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    const expectedOptionalProviderGate =
      response.status() === 503 &&
      /^\/api\/broadcast\/(?:studios|capture\/nodes)\/[0-9a-f-]+\/media-token$/i.test(pathname);
    if (response.status() >= 500 && !expectedOptionalProviderGate) {
      failures.push(`http:${response.status()} ${pathname}`);
    }
  });
  return failures;
}

const shardCount = 4;

for (let shard = 0; shard < shardCount; shard += 1) {
  test(`registered client routes render without application failure ${shard + 1}/${shardCount}`, async ({ page }) => {
    test.setTimeout(240_000);
    const failures = runtimeFailures(page);
    const routes = clientRouteQualificationManifest.filter(
      (_route, index) => index % shardCount === shard,
    );

    for (const route of routes) {
      const response = await page.goto(route.qualificationPath, {
        waitUntil: "networkidle",
      });
      expect(
        response?.status() ?? 200,
        `${route.pattern} returned a server failure`,
      ).toBeLessThan(500);
      await expect(
        page.locator("#main-content"),
        `main content for ${route.pattern}`,
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Updating CreativesOS" }),
      ).toHaveCount(0);
      await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(0);
      expect(failures.splice(0), `runtime failures for ${route.pattern}`).toEqual([]);
    }
  });
}
