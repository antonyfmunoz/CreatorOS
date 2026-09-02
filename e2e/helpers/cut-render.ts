import { expect, type APIRequestContext, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/** Pixel studies inspect one real private export; still-API tests own its quota. */
export async function downloadCutRender(request: APIRequestContext, jobId: string, destination: string, headers: Record<string, string> = {}) {
  const response = await request.get(`/api/cut/jobs/${encodeURIComponent(jobId)}/media-file`, { headers });
  expect(response.ok(), `Private render download HTTP ${response.status()}`).toBeTruthy();
  writeFileSync(destination, await response.body());
  return destination;
}

export function decodeCutRenderFrame(file: string, frame: number) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("A decoded frame index must be a nonnegative integer");
  return execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"],
    { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
}

/** Retain bounded job-state evidence without copying private artifact/source URLs. */
export async function waitForCutRender(request: APIRequestContext, jobId: string, info: TestInfo, headers: Record<string, string> = {}) {
  const started = Date.now();
  const states: Array<Record<string, unknown>> = [];
  let previous = "";
  try {
    await expect.poll(async () => {
      const response = await request.get(`/api/cut/jobs/${jobId}`, { headers });
      expect(response.ok(), `Render status HTTP ${response.status()}`).toBeTruthy();
      const job = await response.json();
      const state = {
        state: job.state,
        progress: job.progress,
        detail: typeof job.detail === "string" ? job.detail.replace(/https?:\/\/\S+/g, "[URL]").slice(0, 600) : undefined,
        errorCode: typeof job.errorCode === "string" ? job.errorCode.slice(0, 100) : undefined,
      };
      const fingerprint = JSON.stringify(state);
      if (fingerprint !== previous) {
        states.push({ elapsedMs: Date.now() - started, ...state });
        if (states.length > 30) states.shift();
        previous = fingerprint;
      }
      return job.state;
    }, { timeout: 60_000, intervals: [500, 1_000] }).not.toMatch(/queued|running/);
  } catch (error) {
    console.error("CUT_RENDER_QUALIFICATION_FAILURE", JSON.stringify({ jobId, states }));
    // Preserve the failed assertion and its pre-cleanup evidence. Cancel only
    // this fixture's job so a failed render cannot occupy the shared actor's
    // quota and turn later independent tests into misleading 429 failures.
    try {
      const cancelled = await request.post(`/api/cut/jobs/${jobId}/cancel`, { headers, timeout: 10_000 });
      states.push({ elapsedMs: Date.now() - started, cleanup: "cancel-owned-fixture", status: cancelled.status() });
    } catch {
      states.push({ elapsedMs: Date.now() - started, cleanup: "cancel-owned-fixture-failed" });
    }
    throw error;
  } finally {
    await info.attach("cut-render-states", { body: JSON.stringify({ jobId, states }, null, 2), contentType: "application/json" });
  }
}
