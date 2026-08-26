import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clientRouteQualificationManifest,
  protectedClientRoutes,
  publicClientRoutes,
} from "../shared/client-route-qualification";

const appSource = fs.readFileSync(
  path.join(process.cwd(), "client/src/App.tsx"),
  "utf8",
);

function registeredRoutes(tag: "Route" | "ProtectedRoute") {
  const pattern = new RegExp(`<${tag}\\s+[^>]*?path="([^"]+)"`, "gs");
  return [...appSource.matchAll(pattern)].map((match) => match[1]);
}

describe("client route qualification manifest", () => {
  it("accounts for every public and protected route registered by the app", () => {
    expect(registeredRoutes("Route")).toEqual(publicClientRoutes);
    expect(registeredRoutes("ProtectedRoute")).toEqual(protectedClientRoutes);
  });

  it("keeps every route unique and materializable for browser qualification", () => {
    const patterns = clientRouteQualificationManifest.map((route) => route.pattern);
    const paths = clientRouteQualificationManifest.map(
      (route) => route.qualificationPath,
    );

    expect(new Set(patterns).size).toBe(patterns.length);
    expect(patterns).toHaveLength(110);
    expect(paths.every((route) => route.startsWith("/") && !route.includes(":"))).toBe(true);
  });
});
