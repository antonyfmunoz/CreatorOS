import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import path from "node:path";

const baseURL = (process.env.CREATIVESOS_PRODUCTION_BASE_URL ?? "https://creativesos.net").replace(/\/$/, "");
const sessionToken = process.env.CREATIVESOS_PRODUCTION_SESSION_TOKEN;
const storageStatePath = process.env.CREATIVESOS_PRODUCTION_STORAGE_STATE;
const hostname = new URL(baseURL).hostname;
const smokeMode = process.env.CREATIVESOS_PRODUCTION_SMOKE_MODE ?? "authenticated";
const dynamicClerkIdentity = Boolean(
  !sessionToken &&
  !storageStatePath &&
  smokeMode !== "public" &&
  process.env.CREATIVESOS_PRODUCTION_SMOKE_USER_EMAIL &&
  process.env.CLERK_SECRET_KEY &&
  process.env.CLERK_PUBLISHABLE_KEY,
);
const dynamicAuthFile = path.join(
  process.cwd(),
  "test-results",
  ".auth",
  "production-smoke.json",
);
const storageState: PlaywrightTestConfig["use"] extends infer Use
  ? Use extends { storageState?: infer State } ? State : never
  : never = storageStatePath
  ? storageStatePath
  : sessionToken
    ? { cookies: [{ name: "__session", value: sessionToken, domain: hostname, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] }
    : dynamicClerkIdentity
      ? dynamicAuthFile
      : undefined;

const browserProjects = [
  { name: "production-mobile", use: { ...devices["Pixel 7"] } },
  { name: "production-desktop", use: { ...devices["Desktop Chrome"] } },
].map((project) => ({
  ...project,
  testMatch: /production-smoke\.spec\.ts/,
  dependencies: dynamicClerkIdentity ? ["clerk-setup"] : [],
}));

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
    ...(dynamicClerkIdentity
      ? [{
          name: "clerk-setup",
          testMatch: /clerk\.setup\.ts/,
          use: { storageState: { cookies: [], origins: [] } },
        }]
      : []),
    ...browserProjects,
  ],
});
