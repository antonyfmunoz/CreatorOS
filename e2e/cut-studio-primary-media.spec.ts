import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("primary hard cuts preserve selected files, partial soundtracks and source aspect", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("primary-media"); mkdirSync(directory, { recursive: true });
  const owner = info.project.name.startsWith("mobile") ? 1 : 2;
  const headers = { "x-creativesos-demo-user": String(owner) };
  const redFile = `${directory}/red.mp4`, greenFile = `${directory}/green.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=180x320:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", redFile]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x00ff00:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", greenFile]);
  const upload = async (file: string, name: string) => {
    const response = await page.request.post("/api/assets/upload-proxy", { headers, multipart: { kind: "video", visibility: "private", video: { name, mimeType: "video/mp4", buffer: readFileSync(file) } } });
    expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).asset;
  };
  const red = await upload(redFile, "red.mp4"), green = await upload(greenFile, "green.mp4");
  const created = await page.request.post("/api/cut/projects", { headers, data: { sourceAssetId: red.id, name: "Primary source custody", duration: 1, mediaKind: "video" } });
  expect(created.ok(), await created.text()).toBeTruthy(); const project = await created.json();
  const added = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { headers, data: { assetId: green.id, name: "Green with sound", duration: 1, mediaKind: "video" } });
  expect(added.ok(), await added.text()).toBeTruthy();
  const loaded = await (await page.request.get(`/api/cut/projects/${project.id}`, { headers })).json();
  const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { ...headers, "If-Match": String(loaded.revision) }, data: { version: 3, clips: [
    { id: "red", track: "v1", start: 0, end: 1, timelineStart: 0, transition: "cut" },
    { id: "green", assetId: green.id, track: "v1", start: 0, end: 1, timelineStart: 1, transition: "cut" },
  ] } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: "Primary source custody", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "V1 clip 2", exact: true })).toBeVisible();
  const queued = await page.request.post(`/api/cut/projects/${project.id}/render`, { headers, data: { aspect: "source", resolution: "720p", quality: "draft", captions: false, fps: 30 } });
  expect(queued.ok(), await queued.text()).toBeTruthy(); const job = await queued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${job.id}`, { headers })).json()).state, { timeout: 60_000 }).toBe("done");
  const media = await page.request.get(`/api/cut/jobs/${job.id}/media-file`, { headers }); expect(media.ok()).toBeTruthy();
  const output = `${directory}/render.mp4`; writeFileSync(output, await media.body());
  const pixel = (time: string) => execFileSync("ffmpeg", ["-v", "error", "-ss", time, "-i", output, "-vf", "crop=2:2:iw/2:ih/2,scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  const first = pixel("0.4"), second = pixel("1.4");
  expect(first[0]).toBeGreaterThan(240); expect(first[1]).toBeLessThan(15);
  expect(second[1]).toBeGreaterThan(240); expect(second[0]).toBeLessThan(15);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", output], { encoding: "utf8" }));
  expect(probe.streams.find((stream: any) => stream.codec_type === "video")).toMatchObject({ width: 404, height: 720 });
  expect(Number(probe.format.duration)).toBeGreaterThan(1.98); expect(Number(probe.format.duration)).toBeLessThan(2.05);
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", output, "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { maxBuffer: 1_000_000 });
  const rms = (from: number, until: number) => { let sum = 0; for (let i = from * 48000; i < until * 48000; i++) sum += pcm.readFloatLE(i * 4) ** 2; return Math.sqrt(sum / ((until - from) * 48000)); };
  expect(rms(.2, .8)).toBeLessThan(.00001); expect(rms(1.2, 1.8)).toBeGreaterThan(.03);
  await info.attach("primary-media-receipt", { body: JSON.stringify({ jobId: job.id, probe, openingRms: rms(.2, .8), closingRms: rms(1.2, 1.8) }), contentType: "application/json" });
});
