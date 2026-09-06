import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("../server/cut-studio-production.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/components/cut/CutStudioCreativeRuntime.tsx", import.meta.url), "utf8");

describe("CutStudio local code-render queue contract", () => {
  it("surfaces only project-scoped code jobs and permits cancellation before claim", () => {
    expect(server).toContain('eq(cutStudioJobs.kind, "code_render")');
    expect(server).toContain('cut.delete("/api/cut/projects/:id/code-renders/:jobId"');
    expect(server).toContain('eq(cutStudioJobs.state, "queued")');
    expect(server).toContain("Cancelled before the paired local node claimed it");
  });
  it("shows the durable job state without offering cancellation of an active lease", () => {
    expect(client).toContain("runtime.codeRenders.filter");
    expect(client).toContain('job.state === "queued"');
    expect(client).toContain("cancelCodeRender(job)");
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
});
