import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
const routeSource = fs.readFileSync(path.join(root, "server/routes.ts"), "utf8");
const automationRouteSource = fs.readFileSync(path.join(root, "server/automation-routes.ts"), "utf8");

const criticalClientRoutes = [
  "/auth/login",
  "/auth/register",
  "/profile",
  "/marketplace",
  "/cart",
  "/orders",
  "/communities",
  "/studio",
  "/distribution/connections",
  "/business",
  "/campaigns",
  "/earnings",
  "/moderation",
  "/automations",
  "/settings",
];

const criticalApiContracts = [
  "/api/user",
  "/api/posts",
  "/api/stories",
  "/api/products",
  "/api/cart",
  "/api/communities",
  "/api/distribution",
  "/api/campaigns",
  "/api/automations",
  "/api/user/settings",
];

describe("critical journey route contracts", () => {
  it("keeps every critical product destination registered", () => {
    for (const route of criticalClientRoutes) expect(appSource, route).toContain(`path="${route}`);
  });

  it("keeps the native API surfaces present", () => {
    const sources = `${routeSource}\n${automationRouteSource}`;
    for (const route of criticalApiContracts) expect(sources, route).toContain(route);
  });
});
