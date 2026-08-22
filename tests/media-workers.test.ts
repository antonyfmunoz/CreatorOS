import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeMediaWorkerConfiguration } from "../shared/media-workers";

describe("scalable media worker control plane", () => {
  it("normalizes bounded worker identity, capabilities, and concurrency", () => {
    expect(normalizeMediaWorkerConfiguration({
      id: "iad-render-1",
      region: "iad",
      capabilities: "transcode,package,unknown, transcode ",
      maxConcurrency: "200",
      version: " release-42 ",
    })).toEqual({
      id: "iad-render-1",
      region: "iad",
      capabilities: ["transcode", "package"],
      maxConcurrency: 64,
      version: "release-42",
    });
  });

  it("defaults to the native capability set but rejects an invalid explicit allowlist", () => {
    const worker = normalizeMediaWorkerConfiguration({ id: "local:1", region: "local", maxConcurrency: 0 });
    expect(worker.capabilities).toEqual(["probe", "thumbnail", "transcode", "package", "waveform", "cut_render", "cut_proxy", "cut_highlights", "cut_transcribe"]);
    expect(worker.maxConcurrency).toBe(1);
    expect(() => normalizeMediaWorkerConfiguration({ id: "local:1", region: "local", capabilities: "shell,arbitrary" })).toThrow(/none of its values are supported/);
  });

  it("persists renewable leases, node heartbeats, drain state, and worker indexes", () => {
    const migration = readFileSync("migrations/0104_scalable_media_workers.sql", "utf8");
    const journal = readFileSync("migrations/meta/_journal.json", "utf8");
    for (const column of ["worker_id", "worker_region", "lease_token", "lease_expires_at", "heartbeat_at", "cancellation_requested_at"])
      expect(migration).toContain(`ADD COLUMN "${column}"`);
    expect(migration).toContain('CREATE TABLE "media_worker_nodes"');
    expect(migration).toContain("media_worker_nodes_status_check");
    expect(migration).toContain("media_worker_nodes_heartbeat_idx");
    expect(migration).toContain("media_processing_jobs_lease_idx");
    expect(migration).toContain("cut_studio_jobs_lease_idx");
    expect(journal).toContain('"tag": "0104_scalable_media_workers"');
  });

  it("keeps standalone workers fail-closed in qualification environments", () => {
    const source = readFileSync("server/media-worker.ts", "utf8");
    expect(source).toContain('CREATOROS_QUALIFICATION_MODE === "true"');
    expect(source).toContain("scheduleMediaCloudProcessing");
    expect(source).toContain("stopMediaCloudProcessing");
  });

  it("maps CutStudio worker capabilities to the job kinds they are allowed to claim", () => {
    const source = readFileSync("server/cut-studio.ts", "utf8");
    expect(source).toContain('capability.replace(/^cut_/, "")');
    expect(source).toContain("inArray(cutStudioJobs.kind, supportedCutKinds)");
  });
});
