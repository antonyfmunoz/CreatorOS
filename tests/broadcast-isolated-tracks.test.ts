import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0073_broadcast_isolated_tracks.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server/broadcast-studio.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/pages/broadcast-studio.tsx", import.meta.url), "utf8");

describe("Broadcast isolated source recordings", () => {
  it("persists an owner-scoped private track manifest with bounded metadata", () => {
    expect(migration).toContain('CREATE TABLE "broadcast_session_tracks"');
    expect(migration).toContain('UNIQUE("session_id", "source_id")');
    expect(migration).toContain('REFERENCES "public"."assets"("id") ON DELETE cascade');
    expect(migration).toContain('"source_type" IN (\'camera\', \'screen\', \'microphone\')');
    expect(migration).toContain('"duration_ms" > 0 AND "duration_ms" <= 28800000');
  });

  it("authorizes private track registration and short-lived media access", () => {
    expect(server).toContain('app.post("/api/broadcast/sessions/:id/tracks"');
    expect(server).toContain('eq(assets.ownerUserId, req.dbUser!.id)');
    expect(server).toContain('eq(assets.visibility, "private")');
    expect(server).toContain('eventType: "broadcast.track.ready"');
    expect(server).toContain('app.get("/api/broadcast/sessions/:id/tracks/:trackId/media"');
    expect(server).toContain('createPrivateAssetReadUrl(track.storageKey)');
    expect(server).not.toContain('Tracks can only be attached to an active or completed broadcast');
  });

  it("captures attached device sources separately and uploads only after explicit stop", () => {
    expect(client).toContain('aria-label="Record isolated source tracks"');
    expect(client).toContain("startIsolatedTrackCaptures();");
    expect(client).toContain("finishIsolatedTrackCaptures()");
    expect(client).toContain('visibility: "private"');
    expect(client).toContain('`/api/broadcast/sessions/${sessionId}/tracks`');
  });
});
