import { describe, expect, it } from "vitest";
import {
  canTransitionMediaJob,
  createAssetCollectionSchema,
  createMediaJobSchema,
  createPlaybackSessionSchema,
  isAdaptiveManifest,
  playbackSessionDelta,
  recordPlaybackEventSchema,
  registerMediaRenditionSchema,
  registerMediaTextTrackSchema,
  assetTagSchema,
  createAssetRightSchema,
} from "../shared/media-cloud";

describe("Media Cloud contracts", () => {
  it("accepts bounded provider-neutral jobs and rejects uncontrolled requests", () => {
    expect(createMediaJobSchema.safeParse({ kind: "transcode", priority: 80, idempotencyKey: "asset-1-transcode", request: { profile: "social" } }).success).toBe(true);
    expect(createMediaJobSchema.safeParse({ kind: "shell", priority: 999, idempotencyKey: "x" }).success).toBe(false);
  });

  it("enforces monotonic processing transitions with explicit retry states", () => {
    expect(canTransitionMediaJob("queued", "running")).toBe(true);
    expect(canTransitionMediaJob("running", "succeeded")).toBe(true);
    expect(canTransitionMediaJob("failed", "queued")).toBe(true);
    expect(canTransitionMediaJob("succeeded", "queued")).toBe(false);
    expect(canTransitionMediaJob("unknown", "running")).toBe(false);
  });

  it("models adaptive renditions and accessible caption tracks independently of providers", () => {
    const rendition = registerMediaRenditionSchema.parse({
      renditionKey: "hls-master-v1",
      role: "adaptive_manifest",
      storageProvider: "r2",
      storageKey: "private/assets/a/master.m3u8",
      publicUrl: null,
      mimeType: "application/vnd.apple.mpegurl",
      manifestType: "hls",
    });
    expect(rendition.manifestType).toBe("hls");
    expect(isAdaptiveManifest(rendition.mimeType)).toBe(true);
    expect(registerMediaTextTrackSchema.safeParse({
      kind: "captions",
      language: "en-US",
      label: "English (US)",
      storageProvider: "r2",
      storageKey: "private/assets/a/en-US.vtt",
      publicUrl: null,
      isDefault: true,
    }).success).toBe(true);
  });

  it("deduplicates playback telemetry by client sequence and bounds watch deltas", () => {
    expect(createPlaybackSessionSchema.safeParse({ assetId: "b3b162d4-e941-49ec-8ce4-7f3f6e20d019", clientSessionId: "client-session-1" }).success).toBe(true);
    expect(recordPlaybackEventSchema.safeParse({ sequence: 1, kind: "progress", occurredAt: new Date(), positionMs: 25_000 }).success).toBe(true);
    expect(playbackSessionDelta({ previousKind: "progress", kind: "progress", previousPositionMs: 1_000, positionMs: 90_000 }).watchMs).toBe(30_000);
    expect(playbackSessionDelta({ previousKind: "seek", kind: "progress", previousPositionMs: 1_000, positionMs: 10_000 }).watchMs).toBe(0);
  });

  it("keeps DAM collection presentation bounded", () => {
    expect(createAssetCollectionSchema.safeParse({ name: "Launch assets", description: "Approved launch media", color: "#1d9bf0" }).success).toBe(true);
    expect(createAssetCollectionSchema.safeParse({ name: "Bad", color: "blue" }).success).toBe(false);
  });

  it("normalizes tags and validates bounded asset rights declarations", () => {
    expect(assetTagSchema.parse({ tag: " Launch_2026 " }).tag).toBe("launch_2026");
    expect(assetTagSchema.safeParse({ tag: "not a valid tag" }).success).toBe(false);
    expect(createAssetRightSchema.safeParse({
      rightsHolderName: "Empyrean Studios",
      basis: "license",
      permittedUses: ["native_publish", "external_distribution"],
      territories: ["US", "CA"],
      validFrom: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    }).success).toBe(true);
    expect(createAssetRightSchema.safeParse({
      rightsHolderName: "Expired before start",
      basis: "license",
      permittedUses: ["playback"],
      territories: ["worldwide"],
      validFrom: "2027-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:00:00.000Z",
    }).success).toBe(false);
  });
});
