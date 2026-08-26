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
  expect(ready).toMatchObject({
    status: "ready",
    release: {
      status: "release_ready",
      blockers: [],
      distribution: {
        tokenCustody: "configured",
        youtube: "configured",
        facebook: "provider_pending",
        instagram: "provider_pending",
        tiktok: "provider_pending",
        x: "provider_pending",
        linkedin: "provider_pending",
      },
      relationshipHub: { aiCopilot: "configured" },
      communityRooms: { liveMedia: "configured" },
    },
  });
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
    // Projection-local instruments transferred from the UMH cockpit must be
    // exercised independently in production. A healthy legacy workspace is
    // not evidence that these newer route/API boundaries survived release.
    "/documents", "/business/design", "/business/planner", "/vision",
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

test("@authenticated configured providers expose safe preflight state", async ({ page }) => {
  const [connectionsResponse, aiResponse, relationshipProvidersResponse] =
    await Promise.all([
      page.request.get("/api/distribution/connections"),
      page.request.get("/api/relationship-hub/ai/status"),
      page.request.get("/api/relationship-hub/providers"),
    ]);

  expect(connectionsResponse.ok()).toBeTruthy();
  expect(aiResponse.ok()).toBeTruthy();
  expect(relationshipProvidersResponse.ok()).toBeTruthy();

  const connections = (await connectionsResponse.json()) as {
    providers: Array<{
      id: string;
      connectionConfigured: boolean;
      connectionAvailable: boolean;
      connections: Array<{ id: string; status: string }>;
    }>;
  };
  const youtube = connections.providers.find(
    (provider) => provider.id === "youtube",
  );
  expect(youtube).toMatchObject({
    connectionConfigured: true,
    connectionAvailable: true,
  });
  expect(
    connections.providers
      .filter((provider) => provider.id !== "youtube")
      .every((provider) => provider.connectionAvailable === false),
  ).toBe(true);

  expect(await aiResponse.json()).toMatchObject({
    provider: "openai",
    configured: true,
    mode: "draft_only",
  });

  const relationshipProviders = (await relationshipProvidersResponse.json()) as {
    configuration: Record<string, { configured: boolean }>;
  };
  expect(relationshipProviders.configuration).toMatchObject({
    instagram: { configured: false },
    messenger: { configured: false },
    whatsapp: { configured: false },
    x: { configured: false },
  });

  const roomProvidersResponse = await page.request.get(
    "/api/community-room-providers",
  );
  expect(roomProvidersResponse.ok()).toBeTruthy();
  expect(await roomProvidersResponse.json()).toMatchObject({
    livekit: { configured: true },
  });
});
