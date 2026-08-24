import { mkdir } from "node:fs/promises";
import path from "node:path";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

const authFile = path.join(
  process.cwd(),
  "test-results",
  ".auth",
  "production-smoke.json",
);

setup.describe.configure({ mode: "serial" });

setup("@authenticated establish short-lived Clerk production smoke identity", async ({ page }) => {
  const emailAddress = process.env.CREATIVESOS_PRODUCTION_SMOKE_USER_EMAIL;
  if (!emailAddress) {
    throw new Error("CREATIVESOS_PRODUCTION_SMOKE_USER_EMAIL is required.");
  }

  await clerkSetup();
  await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/auth(?:\/|$)/);

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
