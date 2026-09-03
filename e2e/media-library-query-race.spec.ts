import { expect, test } from "@playwright/test";

test("media library keeps a new upload when an older list response arrives last", async ({ page }) => {
  let release!: () => void, captured!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { captured = resolve; });
  let intercepted = false;
  await page.route("**/api/media/assets", async route => {
    if (intercepted || route.request().method() !== "GET") return route.continue();
    intercepted = true;
    const original = await route.fetch();
    captured();
    await held;
    await route.fulfill({ response: original });
  });
  try {
    await page.goto("/library");
    await ready;
    await page.getByLabel("Upload visibility").selectOption("private");
    const filename = `retained-upload-${crypto.randomUUID()}.png`;
    await page.locator('input[type="file"]').setInputFiles({ name: filename, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await expect(page.getByText(`${filename} is in your library and processing now.`, { exact: true })).toBeVisible();
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
    const staleResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/media/assets" && new URL(response.url()).search === "");
    release();
    await staleResponse;
    // Two paints let the deliberately late response commit if it still owns
    // the cache. No fixture replaces the actual uploaded or returned assets.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
    await page.getByText(filename, { exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete asset", exact: true })).toBeVisible();
  } finally { release(); }
});
