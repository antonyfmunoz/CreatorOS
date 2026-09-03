import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

test("CutStudio retry requests preserve one child and never grant another owner access", async ({ page }, info) => {
  const directory = info.outputPath("retry"); mkdirSync(directory, { recursive: true });
  const source = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10:d=0.3",
    "-c:v", "libx264", "-threads", "1", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private",
    video: { name: "retry-source.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(upload.status()).toBe(201); const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Retry qualification", duration: 0.3, mediaKind: "video" } });
  expect(created.ok()).toBe(true); const project = await created.json();
  // Missing transcript is an actual local domain failure, not a provider call.
  const started = await page.request.post(`/api/cut/projects/${project.id}/highlights`, { data: {} });
  expect(started.status()).toBe(202); const original = await started.json();
  const read = async (id: string) => {
    const response = await page.request.get(`/api/cut/jobs/${id}`); expect(response.ok()).toBe(true); return response.json();
  };
  await expect.poll(async () => (await read(original.id)).state, { timeout: 15_000 }).toBe("error");
  expect(await read(original.id)).toMatchObject({ errorCode: "transcript_required", attempt: 1, maxAttempts: 3 });
  const otherOwner = info.project.name.startsWith("mobile") ? "2" : "1";
  const denied = await page.request.post(`/api/cut/jobs/${original.id}/retry`, { headers: { "x-creativesos-demo-user": otherOwner }, data: {} });
  expect(denied.status()).toBe(404);
  const responses = await Promise.all(Array.from({ length: 4 }, () => page.request.post(`/api/cut/jobs/${original.id}/retry`, { data: {} })));
  expect(responses.map(response => response.status()).sort()).toEqual([200, 200, 200, 202]);
  const retries = await Promise.all(responses.map(response => response.json()));
  expect(new Set(retries.map(job => job.id)).size).toBe(1);
  expect(retries[0].id).not.toBe(original.id);
  expect(retries.every(job => job.retryOfJobId === original.id)).toBe(true);
  await expect.poll(async () => (await read(retries[0].id)).state, { timeout: 15_000 }).toBe("error");
  const child = await read(retries[0].id);
  expect(child).toMatchObject({ attempt: 1, errorCode: "transcript_required" });
  const replay = await page.request.post(`/api/cut/jobs/${original.id}/retry`, { data: {} });
  expect(replay.status()).toBe(200); expect((await replay.json()).id).toBe(child.id);
  expect((await read(original.id)).attempt).toBe(1);
  const jobsResponse = await page.request.get(`/api/cut/projects/${project.id}`); expect(jobsResponse.ok()).toBe(true);
  const { jobs } = await jobsResponse.json();
  expect(jobs.filter((job: any) => job.retryOfJobId === original.id)).toHaveLength(1);
  await info.attach("retry-receipt", { body: JSON.stringify({ originalId: original.id, childId: child.id,
    requests: 4, createdChildren: 1, originalAttempts: 1, childAttempts: 1, otherOwnerStatus: denied.status() }), contentType: "application/json" });
});
