import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const baseURL = (process.env.CREATIVESOS_PRODUCTION_BASE_URL ?? "https://creativesos.net").replace(/\/$/, "");
const sessionToken = process.env.CREATIVESOS_PRODUCTION_SESSION_TOKEN;
const storageStatePath = process.env.CREATIVESOS_PRODUCTION_STORAGE_STATE;
const hostname = new URL(baseURL).hostname;
const storageState: PlaywrightTestConfig["use"] extends infer Use
  ? Use extends { storageState?: infer State } ? State : never
  : never = storageStatePath
  ? storageStatePath
  : sessionToken
    ? { cookies: [{ name: "__session", value: sessionToken, domain: hostname, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] }
    : undefined;

export default defineConfig({
  testDir: "./e2e-production",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["line"], ["html", { outputFolder: "production-smoke-report", open: "never" }]],
  use: {
    baseURL,
    storageState,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "production-mobile", use: { ...devices["Pixel 7"] } },
    { name: "production-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
