import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("../server/cut-studio-production.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/components/cut/CutStudioCreativeRuntime.tsx", import.meta.url), "utf8");
const localNodeServer = readFileSync(new URL("../server/cut-local-nodes.ts", import.meta.url), "utf8");
const cli = readFileSync(new URL("../cli/creativesos.mjs", import.meta.url), "utf8");

describe("CutStudio local code-render queue contract", () => {
  it("surfaces only project-scoped code jobs and permits cancellation before claim", () => {
    expect(server).toContain('eq(cutStudioJobs.kind, "code_render")');
    expect(server).toContain('cut.delete("/api/cut/projects/:id/code-renders/:jobId"');
    expect(server).toContain('eq(cutStudioJobs.state, "queued")');
    expect(server).toContain("Cancelled before the paired local node claimed it");
  });
  it("offers cancellation before claim and a cooperative stop request for a live lease", () => {
    expect(client).toContain("runtime.codeRenders.filter");
    expect(client).toContain('job.state === "queued"');
    expect(client).toContain('job.state === "running" && !cancellationPending');
    expect(client).toContain('job.state === "running" ? "Cancellation requested');
    expect(client).toContain("cancelCodeRender(job)");
    expect(server).toContain('detail: "Cancellation requested; stopping paired local node"');
    expect(server).toContain('eventType: "cutstudio.code_render.cancellation_requested"');
  });
  it("stops the claimed container before releasing the paired node", () => {
    expect(localNodeServer).toContain('status: "cancelling", cancelRequested: true');
    expect(localNodeServer).toContain("finalizeRequestedCancellation");
    expect(localNodeServer).toContain('state: "cancelled", detail: "Cancelled on the paired local node"');
    expect(localNodeServer).toContain('isNull(cutStudioJobs.cancellationRequestedAt)');
    expect(cli).toContain("const cancellation = new AbortController()");
    expect(cli).toContain("heartbeat.body?.cancelRequested === true");
    expect(cli).toContain("signal: cancellation.signal");
  });
  it("makes completed private output discoverable and refreshes reusable project media", () => {
    expect(client).toContain('/api/cut/jobs/${encodeURIComponent(job.id)}/media-file');
    expect(client).toContain("onProjectMediaChanged");
    expect(client).toContain('job.mode !== "video" && job.mode !== "still"');
  });
  it("retries only a failed code render with its original durable request", () => {
    expect(server).toContain('cut.post("/api/cut/projects/:id/code-renders/:jobId/retry"');
    expect(server).toContain('eq(cutStudioJobs.kind, "code_render")');
    expect(server).toContain('eq(cutStudioJobs.state, "error")');
    expect(client).toContain("retryCodeRender(job)");
  });
  it("admits bounded code batches without granting any node more than one lease", () => {
    expect(server).toContain('cut.post("/api/cut/projects/:id/compositions/:compositionId/code-render-batches"');
    expect(server).toContain('At most 20 CutStudio jobs can be active');
    expect(server).toContain('eventType: "cutstudio.code_render.batch_queued"');
    expect(client).toContain("Optional input batch JSON (2–20 inputs)");
    expect(client).toContain("queueCodeRenderBatch");
  });
  it("updates a pinned source as a revision instead of replacing prior render receipts", () => {
    expect(client).toContain("beginCodeCompositionRevision");
    expect(client).toContain('"Save source revision"');
    expect(client).toContain('"If-Match": String(editing.revision)');
    expect(client).toContain("New pinned source revision saved. Existing render receipts remain immutable");
  });
  it("enforces a declared value-only input contract before durable work is created", () => {
    expect(server).toContain("normalizeCutCodeRenderInput");
    expect(server).toContain("Composition input does not match this code contract");
    expect(server).toContain("A batch input does not match this code contract");
    expect(client).toContain("Optional typed input contract JSON");
    expect(client).toContain("Code composition input contract");
  });
});
