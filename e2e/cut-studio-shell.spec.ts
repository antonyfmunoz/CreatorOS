import { expect, test } from "@playwright/test";

test("CutStudio exposes a wide private editing workspace", async ({ page }) => {
  await page.goto("/cut-studio");
  await expect(page.getByRole("heading", { name: "CutStudio" })).toBeVisible();
  await expect(page.getByText("Start with your footage")).toBeVisible();
  await expect(page.getByText(/Upload private video or audio/)).toBeVisible();
  const viewport = page.viewportSize();
  const workspace = await page.locator(".app-container").boundingBox();
  expect(workspace).not.toBeNull();
  if (viewport && viewport.width >= 1200) expect(workspace!.width).toBeGreaterThan(1000);
  else expect(workspace!.width).toBeLessThanOrEqual(720);
});
