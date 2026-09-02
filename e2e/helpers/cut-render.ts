import { expect, type APIRequestContext, type TestInfo } from "@playwright/test";

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
    throw error;
  } finally {
    await info.attach("cut-render-states", { body: JSON.stringify({ jobId, states }, null, 2), contentType: "application/json" });
  }
}
