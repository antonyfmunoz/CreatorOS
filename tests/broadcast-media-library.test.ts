import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("../server/broadcast-studio.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/pages/broadcast-studio.tsx", import.meta.url), "utf8");

describe("Broadcast business media library", () => {
  it("keeps production assets private and authorizes access through business roles", () => {
    expect(server).toContain('app.get("/api/broadcast/media"');
    expect(server).toContain('eq(assets.visibility, "private")');
    expect(server).toContain("await userBusinessRole(req.dbUser!.id, asset.businessId)");
    expect(server).toContain('app.get("/api/broadcast/media/:id/access"');
    expect(server).toContain('app.get("/api/broadcast/media/:id/stream"');
    expect(server).toContain("privateBroadcastMediaDescriptor(asset)");
  });

  it("uploads once, reuses media in scenes, and removes only the catalog membership", () => {
    expect(client).toContain('Panel title="Business media library"');
    expect(client).toContain('accept="image/*,video/*"');
    expect(client).toContain('"POST", "/api/broadcast/media"');
    expect(client).toContain("addBusinessMediaToScene");
    expect(server).toContain("broadcastLibrary: false");
    const removeMediaRoute = server.slice(server.indexOf('app.delete("/api/broadcast/media/:id"'), server.indexOf('app.get("/api/broadcast/luts"'));
    expect(removeMediaRoute).not.toContain("removeStoredAsset");
  });
});
