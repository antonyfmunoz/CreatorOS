import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(
    new URL("../client/public/creativesos.webmanifest", import.meta.url),
    "utf8",
  ),
);
const worker = readFileSync(
  new URL("../client/public/creativesos-sw.js", import.meta.url),
  "utf8",
);

describe("CreativesOS installable web shell", () => {
  it("provides an application-scoped manifest and useful creator shortcuts", () => {
    expect(manifest.name).toBe("CreativesOS");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(
      manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url),
    ).toEqual(
      expect.arrayContaining(["/create", "/production-planner", "/media"]),
    );
  });

  it("never caches API responses or private page documents", () => {
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('caches.match("/offline.html")');
    expect(worker).not.toContain(
      "cache.put(event.request, response.clone())\n    return;\n  }\n  if (event.request.mode",
    );
  });
});
