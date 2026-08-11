import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3417);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], extraHTTPHeaders: { "x-creativesos-demo-user": "1" } } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], extraHTTPHeaders: { "x-creativesos-demo-user": "2" } } },
  ],
  webServer: {
    command: "npm run dev:demo",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      CREATOROS_DEMO_MODE: "true",
      VITE_CREATOROS_DEMO_MODE: "true",
      PUBLIC_APP_URL: baseURL,
    },
  },
});
