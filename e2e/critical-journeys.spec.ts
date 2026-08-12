import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

function watchRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon"))
      errors.push(message.text());
  });
  return errors;
}

function watchServerFailures(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return errors;
}

async function expectNoHighImpactAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
}

test("public trust surfaces remain accessible without application navigation", async ({
  page,
}) => {
  await page.goto("/trust");
  await expect(
    page.getByRole("heading", { name: "CreativesOS Trust Center" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Trust policies" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  await expectNoHighImpactAccessibilityViolations(page);
});

test("primary navigation matches the current destination", async ({ page }) => {
  const runtimeErrors = watchRuntime(page);
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primary).toBeVisible();
  await expect(
    primary.getByRole("button", { name: "Explore" }),
  ).toHaveAttribute("aria-current", "page");

  await primary.getByRole("button", { name: "Marketplace" }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
  await expect(
    primary.getByRole("button", { name: "Marketplace" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("searchbox", { name: "Search marketplace" }),
  ).toBeVisible();

  await primary.getByRole("button", { name: "Communities" }).click();
  await expect(page).toHaveURL(/\/communities$/);
  await expect(
    primary.getByRole("button", { name: "Communities" }),
  ).toHaveAttribute("aria-current", "page");
  expect(runtimeErrors).toEqual([]);
});

test("profile tabs remain clickable after horizontal navigation", async ({
  page,
}) => {
  await page.goto("/profile");
  const profileNav = page.getByRole("navigation", { name: "Profile content" });
  await expect(profileNav).toBeVisible();
  await profileNav.getByRole("button", { name: "Likes" }).click();
  await expect(
    profileNav.getByRole("button", { name: "Likes" }),
  ).toHaveAttribute("aria-current", "page");
  await profileNav.getByRole("button", { name: "Posts", exact: true }).click();
  await expect(
    profileNav.getByRole("button", { name: "Posts", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("account privacy is reachable without performing a destructive action", async ({
  page,
}) => {
  await page.goto("/settings/privacy");
  await expect(
    page.getByRole("heading", { name: "Data & privacy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download JSON export" }),
  ).toBeVisible();
  const schedule = page.getByRole("button", {
    name: "Schedule account deletion",
  });
  await expect(schedule).toBeDisabled();
  await expectNoHighImpactAccessibilityViolations(page);
});

test("core provider-independent workspaces render without route failures", async ({
  page,
}) => {
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
    "/cut-studio",
    "/broadcast",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Updating CreativesOS" }),
    ).toHaveCount(0);
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(
      0,
    );
  }
});

test("distribution composer reflects an active channel connection", async ({
  page,
}) => {
  await page.route("**/api/distribution/connections", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          {
            id: "youtube",
            label: "YouTube",
            connectionConfigured: true,
            connectionAvailable: true,
            connections: [
              {
                id: "qualification-youtube",
                provider: "youtube",
                providerAccountName: "Qualification Channel",
                status: "active",
                scopes: ["youtube.readonly", "youtube.upload"],
                tokenExpiresAt: null,
                lastValidatedAt: new Date().toISOString(),
                lastErrorCode: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        ],
      }),
    });
  });

  await page.goto("/studio");
  const youtube = page.getByRole("button", { name: /YouTube Connected/ });
  await expect(youtube).toBeVisible();
  await youtube.click();
  await expect(youtube).toHaveClass(/border-white/);
});

test("all static product surfaces render without application or server failure", async ({
  page,
}) => {
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
    "/cut-studio",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(
      page.locator("#main-content"),
      `main content for ${route}`,
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Updating CreativesOS" }),
    ).toHaveCount(0);
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(
      0,
    );
  }
  expect(failures).toEqual([]);
});

test("CutStudio is reachable from Create and presents a private-media workflow", async ({
  page,
}) => {
  const failures = watchServerFailures(page);
  await page.goto("/create");
  await page.getByRole("button", { name: /Open CutStudio/ }).click();
  await expect(page).toHaveURL(/\/cut-studio$/);
  await expect(page.getByRole("heading", { name: "CutStudio" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Start with your footage" }),
  ).toBeVisible();
  await expect(
    page.locator('input[type="file"][accept="video/*,audio/*"]'),
  ).toHaveCount(1);
  await expect(page.getByText(/keeps the source secure/i)).toBeVisible();
  await expectNoHighImpactAccessibilityViolations(page);
  expect(failures).toEqual([]);
});

test("dynamic identity and content routes fail gracefully", async ({
  page,
}) => {
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
    await expect(
      page.locator("#main-content"),
      `main content for ${route}`,
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Updating CreativesOS" }),
    ).toHaveCount(0);
    await expect(page.getByText("Page Not Found", { exact: true })).toHaveCount(
      0,
    );
  }
  expect(failures).toEqual([]);
});

test("a text post persists after publishing and reload", async ({
  page,
}, testInfo) => {
  const failures = watchServerFailures(page);
  const content = `Field-tested post ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/new-text-post");
  await page.getByPlaceholder("What's on your mind?").fill(content);
  await page
    .getByRole("button", { name: "Share", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test("the empty story affordance creates a media story that survives reload", async ({
  page,
}, testInfo) => {
  const failures = watchServerFailures(page);
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  const existingStories = await page.request.get(
    `/api/users/${owner}/stories`,
    { headers: { "x-creativesos-demo-user": String(owner) } },
  );
  for (const story of (await existingStories.json()) as Array<{ id: number }>) {
    const removed = await page.request.delete(`/api/stories/${story.id}`, {
      headers: { "x-creativesos-demo-user": String(owner) },
    });
    expect(removed.ok()).toBeTruthy();
  }
  const caption = `Story field test ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create a story" }).click();
  await expect(
    page.getByRole("heading", { name: "Add to Your Story" }),
  ).toBeVisible();
  await page
    .locator('input[type="file"][accept="image/*,video/*"]')
    .setInputFiles(
      resolve(
        process.cwd(),
        "attached_assets/stitch_creatoros/stitch_creatoros/community_chat_context_menu_cleaned/screen.png",
      ),
    );
  await page.getByPlaceholder("Write a caption...").fill(caption);
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/stories") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(
    page.getByRole("button", { name: "View your story" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "View your story" }),
  ).toBeVisible();
  const stories = await page.request.get("/api/stories");
  expect(stories.ok()).toBeTruthy();
  expect(
    (await stories.json()).some(
      (story: { caption?: string }) => story.caption === caption,
    ),
  ).toBeTruthy();
  expect(failures).toEqual([]);
});

test("Following feed selection reflects follow and unfollow after refresh", async ({
  page,
}, testInfo: TestInfo) => {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  const peer = owner === 1 ? 2 : 1;
  const marker = `Following field test ${testInfo.project.name} ${Date.now()}`;
  const peerPost = await page.request.post("/api/posts", {
    data: { content: marker, mediaType: "text" },
    headers: { "x-creativesos-demo-user": String(peer) },
  });
  expect(peerPost.ok()).toBeTruthy();
  const followed = await page.request.post(`/api/users/${peer}/follow`, {
    headers: { "x-creativesos-demo-user": String(owner) },
  });
  expect(followed.ok()).toBeTruthy();
  await page.goto("/");
  const following = page.getByRole("button", {
    name: "Following",
    exact: true,
  });
  await following.click();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  const unfollowed = await page.request.post(`/api/users/${peer}/unfollow`, {
    headers: { "x-creativesos-demo-user": String(owner) },
  });
  expect(unfollowed.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Start following creators to see posts in your feed"),
  ).toBeVisible();
});

test("automation authoring, activation, execution and activity persist through the UI", async ({
  page,
}) => {
  const failures = watchServerFailures(page);
  await page.goto("/automations");
  const template = page
    .locator("article")
    .filter({ hasText: "Content brief to draft" });
  await expect(template).toBeVisible();
  const created = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes("/api/automations/from-template/content-brief-to-draft") &&
      response.request().method() === "POST",
  );
  await template.getByRole("button", { name: "Use playbook" }).click();
  const definition = await (await created).json();
  const activated = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/automations/${definition.id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  expect((await activated).ok()).toBeTruthy();
  await page
    .getByPlaceholder(/Give this run a brief/)
    .fill("Qualified launch update");
  const started = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/automations/${definition.id}/run`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run automation" }).click();
  const run = await (await started).json();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/automations/runs/${run.id}`,
        );
        return (await response.json()).status;
      },
      { timeout: 20_000 },
    )
    .toBe("succeeded");
  await page.reload();
  await page.getByRole("button", { name: "activity", exact: true }).click();
  await expect(
    page.getByText("Content brief to draft", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText("succeeded", { exact: true }).last(),
  ).toBeVisible();
  expect(failures).toEqual([]);
});

test("native group chat can be assembled, messaged and reopened from the UI", async ({
  page,
}, testInfo) => {
  const peerUsername = testInfo.project.name.startsWith("mobile")
    ? "sarahmitchell"
    : "owner";
  const peerName = testInfo.project.name.startsWith("mobile")
    ? "Sarah Mitchell"
    : "Owner Creative";
  const groupName = `Field group ${testInfo.project.name} ${Date.now()}`;
  const message = `Persisted group message ${Date.now()}`;
  await page.goto("/messages");
  await page
    .getByRole("button", { name: "Start or manage native chats" })
    .click();
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await page.getByRole("button", { name: "Create group chat" }).click();
  await page.getByLabel("Group Name").fill(groupName);
  await page.getByPlaceholder("Search by username").fill(peerUsername);
  await expect(page.getByText(peerName, { exact: true })).toBeVisible();
  await page.getByText(`@${peerUsername}`, { exact: true }).click();
  await page
    .getByRole("button", { name: "Create Group Chat", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
  await page.getByPlaceholder("Type a message...").fill(message);
  await page.getByPlaceholder("Type a message...").press("Enter");
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await page.reload();
  if (testInfo.project.name.startsWith("mobile")) {
    const back = page.getByRole("button", { name: "Back to conversations" });
    if (await back.isVisible()) await back.click();
  }
  await page
    .getByRole("button", { name: "Start or manage native chats" })
    .click();
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();
  await page.getByText(groupName, { exact: true }).click();
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
});

test("notification mark-all state persists after reload", async ({
  page,
}, testInfo) => {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  const marker = `Unread field notification ${testInfo.project.name} ${Date.now()}`;
  const created = await page.request.post("/api/notifications", {
    data: { type: "system", message: marker },
    headers: { "x-creativesos-demo-user": String(owner) },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto("/notifications");
  await expect(
    page.getByRole("button", { name: new RegExp(marker) }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(
    0,
  );
  const notifications = await page.request.get(
    `/api/users/${owner}/notifications`,
  );
  expect(
    (await notifications.json()).find(
      (item: { message: string }) => item.message === marker,
    )?.read,
  ).toBe(true);
});

test("profile links can be edited and persist after reload", async ({
  page,
}, testInfo) => {
  const failures = watchServerFailures(page);
  const label = `Portfolio ${testInfo.project.name}`;
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit Profile" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Add your website|Add link/ })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Link 1 label" }).fill(label);
  await page
    .getByRole("textbox", { name: "Link 1 URL" })
    .fill("https://creativesos.net");
  const saved = page.waitForResponse(
    (response) =>
      /\/api\/users\/\d+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Done" }).click();
  expect((await saved).status()).toBeLessThan(300);
  await expect(page.getByRole("link", { name: label })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: label })).toBeVisible();
  expect(failures).toEqual([]);
});

test("account settings persist and apply high contrast mode", async ({
  page,
}) => {
  const failures = watchServerFailures(page);
  await page.goto("/settings");
  const push = page.getByRole("switch", { name: "Push notifications" });
  await expect(push).toBeChecked();
  const pushSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/user/settings") &&
      response.request().method() === "PATCH",
  );
  await push.click();
  expect((await pushSaved).status()).toBeLessThan(300);
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Push notifications" }),
  ).not.toBeChecked();

  const contrast = page.getByRole("switch", {
    name: "High-contrast color mode",
  });
  const contrastSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/user/settings") &&
      response.request().method() === "PATCH",
  );
  await contrast.click();
  expect((await contrastSaved).status()).toBeLessThan(300);
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "high_contrast",
  );
  expect(failures).toEqual([]);
});

test("marketplace search filters community discovery", async ({ page }) => {
  const failures = watchServerFailures(page);
  await page.goto("/marketplace");
  const marketplace = page.locator("main");
  await marketplace
    .getByRole("button", { name: "Communities", exact: true })
    .click();
  const search = marketplace.getByRole("searchbox", {
    name: "Search marketplace",
  });
  await search.fill("Web Developers");
  await expect(
    page.getByRole("heading", { name: "Web Developers" }),
  ).toBeVisible();
  await search.fill("no-community-has-this-name");
  await expect(
    page.getByText("No communities match those filters yet."),
  ).toBeVisible();
  expect(failures).toEqual([]);
});

test("community content remains gated until membership is created", async ({
  page,
}) => {
  const failures = watchServerFailures(page);
  await page.goto("/communities/1");
  const join = page.getByRole("button", { name: "Join community" });
  await expect(join).toBeVisible();
  const joined = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/communities/1/join") &&
      response.request().method() === "POST",
  );
  await join.click();
  expect((await joined).status()).toBeLessThan(300);
  await expect(page.getByPlaceholder(/Message #general/)).toBeEnabled();
  await page.getByRole("button", { name: "Search community" }).click();
  await expect(
    page.getByText("Recent messages", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search this channel" })
    .fill("virtual hackathon");
  const searchResult = page.getByRole("button", { name: /virtual hackathon/i });
  await searchResult.click();
  await expect(searchResult).toHaveAttribute("aria-pressed", "true");
  const message = page
    .locator('[id^="community-message-"]')
    .filter({ hasText: "virtual hackathon" })
    .first();
  await message.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Like" })).toBeVisible();
  expect(failures).toEqual([]);
});

test("primary surfaces have no serious accessibility violations", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const routes = [
    "/",
    "/marketplace",
    "/create",
    "/communities",
    "/profile",
    "/messages",
    "/business",
    "/automations",
    "/settings",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-content")).toBeVisible();
    await expectNoHighImpactAccessibilityViolations(page);
  }
});
