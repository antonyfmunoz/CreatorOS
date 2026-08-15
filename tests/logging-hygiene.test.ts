import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["client/src", "server", "shared"];
const allowed = new Set([
  "server/observability.ts",
  "server/vite.ts",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(candidate);
    return /\.(ts|tsx)$/.test(entry.name) ? [candidate] : [];
  });
}

describe("production logging hygiene", () => {
  it("keeps raw debug logs out of browser and server source", () => {
    const offenders = roots
      .flatMap(sourceFiles)
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => !allowed.has(file))
      .filter((file) => /console\.(log|debug)\s*\(/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("compensates failed story asset registration without returning internal errors", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const storyPath = routes.indexOf('"/api/stories"');
    const start = routes.lastIndexOf("app.post(", storyPath);
    const end = routes.indexOf('// Delete a story', start);
    const storyRoute = routes.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(storyRoute).toContain("storage.deleteStory(story.id)");
    expect(storyRoute).toContain('removeStoredAsset(stored.storageKey, "public")');
    expect(storyRoute).toContain('message: invalid ? "Story data is invalid" : "Failed to create story"');
    expect(storyRoute).not.toContain('error: error instanceof Error ? error.message');
    expect(storyRoute).not.toContain('console.error("Error details:", error.message)');
  });
});
