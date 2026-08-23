#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const token = process.env.CREATIVESOS_PRODUCTION_SESSION_TOKEN;
const storageState = process.env.CREATIVESOS_PRODUCTION_STORAGE_STATE;
if (!token && !storageState) {
  console.error("Authenticated production smoke requires CREATIVESOS_PRODUCTION_SESSION_TOKEN or CREATIVESOS_PRODUCTION_STORAGE_STATE.");
  process.exit(2);
}
if (storageState && !existsSync(storageState)) {
  console.error("The configured production storage-state file does not exist.");
  process.exit(2);
}
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "--config", "playwright.production.config.ts"], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
process.exit(result.status ?? 1);
