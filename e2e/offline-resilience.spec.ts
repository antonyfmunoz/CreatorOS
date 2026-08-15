import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

function actor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

function api(page: Page, userId: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(userId) },
  });
}

function queuedKinds(page: Page) {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const fallback = () => {
      try {
        const value = JSON.parse(localStorage.getItem("creativesos:offline-json-outbox:v1") ?? "[]");
        return Array.isArray(value) ? value.map((item: { kind: string }) => item.kind) : [];
      } catch { return []; }
    };
    const request = indexedDB.open("creativesos-offline-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("operations", "readonly").objectStore("operations").getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => { resolve([...read.result.map((item: { kind: string }) => item.kind), ...fallback()]); db.close(); };
    };
  })).catch(() => [] as string[]);
}

test("offline post survives reconnect while server post and message replays stay exactly once", async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  const owner = actor(testInfo);
  const peer = owner === 1 ? 2 : 1;
  const marker = `offline-${testInfo.project.name}-${Date.now()}`;

  const postMutation = randomUUID();
  const firstPost = await api(page, owner, "POST", "/api/posts", {
    content: `Idempotent ${marker}`,
    mediaType: "text",
    clientMutationId: postMutation,
  });
  expect(firstPost.status(), await firstPost.text()).toBe(201);
  const firstPostBody = await firstPost.json();
  const replayedPost = await api(page, owner, "POST", "/api/posts", {
    content: `Idempotent ${marker}`,
    mediaType: "text",
    clientMutationId: postMutation,
  });
  expect(replayedPost.status()).toBe(200);
  expect((await replayedPost.json()).id).toBe(firstPostBody.id);

  const conversationResponse = await api(page, owner, "POST", "/api/conversations", {
    userIds: [owner, peer],
    isGroup: false,
  });
  expect(conversationResponse.ok(), await conversationResponse.text()).toBeTruthy();
  const conversation = await conversationResponse.json();
  const messageMutation = randomUUID();
  const firstMessage = await api(page, owner, "POST", "/api/messages", {
    conversationId: conversation.id,
    content: `Exactly once ${marker}`,
    clientMutationId: messageMutation,
  });
  expect(firstMessage.status(), await firstMessage.text()).toBe(201);
  const firstMessageBody = await firstMessage.json();
  const replayedMessage = await api(page, owner, "POST", "/api/messages", {
    conversationId: conversation.id,
    content: `Exactly once ${marker}`,
    clientMutationId: messageMutation,
  });
  expect(replayedMessage.status()).toBe(200);
  expect((await replayedMessage.json()).id).toBe(firstMessageBody.id);

  await page.goto("/new-text-post");
  await page.getByPlaceholder("What's on your mind?").fill(`Queued ${marker}`);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.locator("header").getByRole("button", { name: "Share" }).click();
  await expect(page).toHaveURL(/\/new-text-post$/);
  await expect.poll(() => queuedKinds(page)).toContain("post.create");
  await expect(page.getByText("You’re offline — changes are protected")).toBeVisible();

  const postReplay = page.waitForResponse((response) =>
    response.url().endsWith("/api/posts") && response.request().method() === "POST" && response.ok(),
  );
  await context.setOffline(false);
  await postReplay;
  await page.goto("/");
  await expect(page.getByText(`Queued ${marker}`, { exact: true })).toBeVisible();
  await expect(page.getByText("You’re offline — changes are protected")).toHaveCount(0);
});

test("offline media upload survives reconnect and enters Media Cloud", async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  const marker = `offline-upload-${testInfo.project.name}-${Date.now()}`;
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Media Cloud" })).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  await context.setOffline(true);
  await page.locator('input[type="file"]').setInputFiles({
    name: `${marker}.png`,
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText(new RegExp(`${marker}\\.png is protected`))).toBeVisible();
  const uploadReplay = page.waitForResponse((response) =>
    response.url().endsWith("/api/assets/upload-proxy") && response.request().method() === "POST" && response.ok(),
  );
  await context.setOffline(false);
  await uploadReplay;
  await expect(page.getByText(`${marker}.png`, { exact: true })).toBeVisible();
});
