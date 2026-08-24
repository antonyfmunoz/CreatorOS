#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const token = process.env.CREATIVESOS_PRODUCTION_SESSION_TOKEN;
const storageState = process.env.CREATIVESOS_PRODUCTION_STORAGE_STATE;
const smokeUserEmail = process.env.CREATIVESOS_PRODUCTION_SMOKE_USER_EMAIL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const hasDynamicClerkIdentity = Boolean(
  smokeUserEmail && clerkSecretKey && clerkPublishableKey,
);
const mode = process.env.CREATIVESOS_PRODUCTION_SMOKE_MODE ?? "authenticated";
if (!new Set(["public", "authenticated", "all"]).has(mode)) {
  console.error("CREATIVESOS_PRODUCTION_SMOKE_MODE must be public, authenticated, or all.");
  process.exit(2);
}
if (mode !== "public" && !token && !storageState && !hasDynamicClerkIdentity) {
  console.error(
    "Authenticated production smoke requires a session token, storage state, or the complete short-lived Clerk smoke identity configuration.",
  );
  process.exit(2);
}
if (storageState && !existsSync(storageState)) {
  console.error("The configured production storage-state file does not exist.");
  process.exit(2);
}
const playwrightCli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const arguments_ = [playwrightCli, "test", "--config", "playwright.production.config.ts"];
if (mode === "public") arguments_.push("--grep", "@public");
if (mode === "authenticated") arguments_.push("--grep", "@authenticated");
const result = spawnSync(process.execPath, arguments_, {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
if (result.error) {
  console.error(`Unable to start Playwright: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 1);
