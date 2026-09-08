import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("../server/cut-studio-production.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/components/cut/CutStudioCreativeRuntime.tsx", import.meta.url), "utf8");
const localNodeServer = readFileSync(new URL("../server/cut-local-nodes.ts", import.meta.url), "utf8");
const cli = readFileSync(new URL("../cli/creativesos.mjs", import.meta.url), "utf8");
const outputCeilingMigration = readFileSync(new URL("../migrations/0124_cut_studio_code_capsule_output_ceiling.sql", import.meta.url), "utf8");

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
    expect(server).toContain('retryStatus: result.status');
    expect(client).toContain("retryCodeRender(job)");
    expect(client).toContain("A prior retry is already terminal; no new execution was queued");
  });
  it("admits bounded code batches without granting any node more than one lease", () => {
    expect(server).toContain('cut.post("/api/cut/projects/:id/compositions/:compositionId/code-render-batches"');
    expect(server).toContain('At most 20 CutStudio jobs can be active');
    expect(server).toContain('eventType: "cutstudio.code_render.batch_queued"');
    expect(client).toContain("Optional input batch JSON (2–20 inputs)");
    expect(client).toContain("queueCodeRenderBatch");
  });
  it("revalidates stored code-capsule limits before issuing a local-node lease", () => {
    expect(server).toContain("cutCodeCapsuleSchema.parse(composition.codeCapsule)");
    expect(server).toContain("cutCodeCapsuleSchema.parse(capsule)");
  });
  it("normalizes only legacy oversized local-output budgets to the enforced runtime ceiling", () => {
    expect(outputCeilingMigration).toContain('UPDATE "cut_studio_compositions"');
    expect(outputCeilingMigration).toContain("to_jsonb(67108864)");
    expect(outputCeilingMigration).toContain("::numeric > 67108864");
    expect(outputCeilingMigration).toContain("maximumOutputBytes");
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
  it("turns a saved input contract into guided render controls without bypassing the raw advanced path", () => {
    expect(client).toContain("function CodeCompositionInputs");
    expect(client).toContain('aria-label="Typed composition inputs"');
    expect(client).toContain("Composition parameters");
    expect(client).toContain("Advanced composition input JSON");
    expect(client).toContain("normalizeCutCodeRenderInput(input as Record<string, unknown>");
  });
  it("makes the isolated runtime's ProRes MOV output available through the same bounded job path", () => {
    expect(client).toContain("MOV · ProRes");
    expect(client).toContain("ProRes profile");
    expect(client).toContain("...(format === \"mov\" ? { proresProfile } : {})");
  });
  it("exposes only the runtime's bounded codec-specific encoding controls", () => {
    expect(client).toContain("Constant quality (CRF)");
    expect(client).toContain("Target bitrate");
    expect(client).toContain("Lossless RGB master");
    expect(client).toContain("VP9 CPU usage");
    expect(client).toContain("...(videoEncoding ? { videoEncoding } : {})");
  });
  it("exposes the isolated runtime's bounded GIF sampling and loop controls", () => {
    expect(client).toContain("GIF sampling preserves the selected range duration");
    expect(client).toContain("GIF frame step");
    expect(client).toContain("GIF looping");
    expect(client).toContain("...(gifOptions ? { gifOptions } : {})");
  });
  it("offers only receipt-bound composition audio for compatible bounded video exports", () => {
    expect(client).toContain("Include composition audio");
    expect(client).toContain("composition audio");
    expect(client).toContain("rangeEnd >= rangeStart");
    expect(client).toContain("...(compositionAudio ? { compositionAudio: true as const } : {})");
  });
  it("allows advanced soundtracks only from the private source capsule", () => {
    expect(client).toContain("Private soundtrack tracks (advanced)");
    expect(client).toContain("private soundtrack tracks");
    expect(client).toContain("capsule-relative");
    expect(client).toContain("bounded reverse interval");
    expect(client).toContain("reverse tracks cannot loop");
    expect(client).toContain("...(audioTracks.length ? { audioTracks } : {})");
  });
  it("imports a binary-capable private package without asking the text editor to reinterpret it", () => {
    expect(client).toContain('aria-label="Import private source package"');
    expect(client).toContain('aria-label="Choose source ZIP"');
    expect(client).toContain("Private binary-capable source package and matching lockfile imported and selected");
    expect(client).toContain("The text editor intentionally does not open or alter binary files");
    expect(client).toContain("onSaveCodeSource(sourcePackageFile, sourceLockfileFile ?? undefined)");
  });
});
