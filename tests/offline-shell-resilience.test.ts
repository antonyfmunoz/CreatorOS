import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const overlays = readFileSync(new URL("../client/src/components/layout/ApplicationOverlays.tsx", import.meta.url), "utf8");
const vite = readFileSync(new URL("../server/vite.ts", import.meta.url), "utf8");

describe("offline application shell resilience", () => {
  it("ships the offline and global-control shell without deferred chunk races", () => {
    expect(app).toContain('import OfflineOperations from "@/components/system/OfflineOperations"');
    expect(app).toContain('import ApplicationOverlays from "@/components/layout/ApplicationOverlays"');
    expect(app).not.toContain('import("@/components/system/OfflineOperations")');
    expect(app).not.toContain('import("@/components/layout/ApplicationOverlays")');
    expect(overlays).toContain("class OptionalOverlayBoundary");
    expect(overlays).toContain('const ChatInterface = lazy');
    expect(overlays).toContain('const MessageButton = lazy');
  });

  it("defers stale-build recovery until connectivity returns", () => {
    expect(app).toContain("if (!navigator.onLine)");
    expect(app).toContain('window.addEventListener("online", () => window.location.reload(), { once: true })');
  });

  it("does not terminate the development server for a browser-side transform error", () => {
    expect(vite).toContain("viteLogger.error(msg, options)");
    expect(vite).not.toContain("process.exit(1)");
  });
});
