import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3417);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Qualification projects share seeded actors and intentionally exercise
  // cross-route persistence. Run serially so a parallel file cannot create a
  // notification, membership, or session while another file is asserting its
  // lifecycle boundary.
  workers: 1,
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
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        extraHTTPHeaders: { "x-creativesos-demo-user": "1" },
      },
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: { "x-creativesos-demo-user": "2" },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      CREATOROS_QUALIFICATION_MODE: "true",
      VITE_CREATOROS_QUALIFICATION_MODE: "true",
      QUALIFICATION_ISOLATED_DATABASE: "true",
      UMH_COMMAND_SIGNING_SECRET: "qualification-only-umh-command-secret",
      UMH_INSTALLATION_ID: "creativesos-browser-qualification",
      PUBLIC_APP_URL: baseURL,
      SOCIAL_TOKEN_ENCRYPTION_KEY:
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      DEVELOPER_API_KEY_PEPPER:
        "qualification-only-developer-api-key-pepper",
    },
  },
});
