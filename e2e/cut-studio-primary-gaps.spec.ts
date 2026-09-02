import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("primary timeline preserves black gaps, sorted placement and audio tails", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("primary-gaps"); mkdirSync(directory, { recursive: true });
  const headers = { "x-creativesos-demo-user": String(info.project.name.startsWith("mobile") ? 1 : 2) };
  const redFile = `${directory}/red.mp4`, greenFile = `${directory}/green.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", redFile]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x00ff00:s=160x90:r=30:d=1", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", greenFile]);
  const upload = async (file: string, name: string) => {
    const response = await page.request.post("/api/assets/upload-proxy", { headers, multipart: { kind: "video", visibility: "private", video: { name, mimeType: "video/mp4", buffer: readFileSync(file) } } });
    expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).asset;
  };
  const red = await upload(redFile, "red.mp4"), green = await upload(greenFile, "green.mp4");
  const created = await page.request.post("/api/cut/projects", { headers, data: { sourceAssetId: red.id, name: "Primary timeline gaps", duration: 1, mediaKind: "video" } });
  expect(created.ok(), await created.text()).toBeTruthy(); const project = await created.json();
  const added = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { headers, data: { assetId: green.id, name: "Green with sound", duration: 1, mediaKind: "video" } });
  expect(added.ok(), await added.text()).toBeTruthy();
  const clips = [
    { id: "green", assetId: green.id, track: "v1", start: 0, end: 1, timelineStart: 3, transition: "cut" },
    { id: "red", track: "v1", start: 0, end: 1, timelineStart: 1, transition: "cut" },
    { id: "tail", assetId: green.id, track: "a1", start: 0, end: 1, timelineStart: 4 },
  ];
  const save = async (value: typeof clips) => {
    const loaded = await (await page.request.get(`/api/cut/projects/${project.id}`, { headers })).json();
    const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { ...headers, "If-Match": String(loaded.revision) }, data: { version: 3, clips: value } });
    expect(saved.ok(), await saved.text()).toBeTruthy();
  };
  await save(clips);
  await page.goto(`/cut-studio?project=${project.id}`);
  await expect(page.getByRole("heading", { name: "Primary timeline gaps", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
  const player = page.getByRole("region", { name: "Primary sequence player", exact: true });
  const slider = player.getByRole("slider", { name: "Sequence frame", exact: true });
  const seekFrame = async (frame: number) => {
    const fromEnd = frame > 74;
    await slider.press(fromEnd ? "End" : "Home");
    for (let i = 0; i < (fromEnd ? 149 - frame : frame); i++) await slider.press(fromEnd ? "ArrowLeft" : "ArrowRight");
    await expect(player).toHaveAttribute("data-preview-frame", String(frame));
  };
  const previewPixel = async () => {
    const { data, info: image } = await sharp(await player.getByLabel("Primary sequence canvas", { exact: true }).screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const index = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * image.channels;
    return [...data.subarray(index, index + 3)];
  };
  for (const frame of [15, 75, 135]) {
    await seekFrame(frame);
    await expect(player.getByLabel("Primary sequence video", { exact: true })).toHaveCount(0);
    expect((await previewPixel()).every((value) => value < 8)).toBe(true);
  }
  for (const [frame, channel] of [[45, 0], [105, 1]]) {
    await seekFrame(frame);
    const video = player.getByLabel("Primary sequence video", { exact: true });
    await expect.poll(async () => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(.5, 1);
    expect((await previewPixel())[channel]).toBeGreaterThan(230);
  }
  await seekFrame(0);
  await player.getByRole("button", { name: "Play sequence", exact: true }).click();
  await expect.poll(async () => Number(await player.getAttribute("data-preview-frame"))).toBeGreaterThan(65);
  await player.getByRole("button", { name: "Pause sequence", exact: true }).click();
  await expect(player).toHaveAttribute("data-preview-state", "paused");
  await page.getByRole("button", { name: "Close sequence", exact: true }).click();
  const settings = { aspect: "16:9", resolution: "720p", quality: "draft", captions: false, fps: 30 };
  const queued = await page.request.post(`/api/cut/projects/${project.id}/render`, { headers, data: settings });
  expect(queued.ok(), await queued.text()).toBeTruthy(); const job = await queued.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cut/jobs/${job.id}`, { headers })).json()).state, { timeout: 60_000 }).toBe("done");
  const media = await page.request.get(`/api/cut/jobs/${job.id}/media-file`, { headers }); expect(media.ok()).toBeTruthy();
  const output = `${directory}/render.mp4`; writeFileSync(output, await media.body());
  const pixel = (time: number) => [...execFileSync("ffmpeg", ["-v", "error", "-ss", String(time), "-i", output, "-vf", "crop=2:2:iw/2:ih/2,scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])];
  for (const at of [.5, 2.5, 4.5]) expect(pixel(at).every((value) => value < 8), `Blank frame at ${at}`).toBe(true);
  expect(pixel(1.5)[0]).toBeGreaterThan(240); expect(pixel(1.5)[1]).toBeLessThan(15);
  expect(pixel(3.5)[1]).toBeGreaterThan(240); expect(pixel(3.5)[0]).toBeLessThan(15);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,nb_frames:format=duration", "-of", "json", output], { encoding: "utf8" }));
  expect(Number(probe.format.duration)).toBeGreaterThan(4.98); expect(Number(probe.format.duration)).toBeLessThan(5.05);
  expect(Number(probe.streams.find((stream: any) => stream.codec_type === "video").nb_frames)).toBe(150);
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", output, "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { maxBuffer: 2_000_000 });
  const rms = (from: number, until: number) => { let sum = 0; for (let i = Math.round(from * 48000); i < Math.round(until * 48000); i++) sum += pcm.readFloatLE(i * 4) ** 2; return Math.sqrt(sum / ((until - from) * 48000)); };
  for (const start of [.2, 1.2, 2.2]) expect(rms(start, start + .5)).toBeLessThan(.00001);
  expect(rms(3.2, 3.8)).toBeGreaterThan(.015); expect(rms(4.2, 4.8)).toBeGreaterThan(.015);
  await save(clips.map((clip) => clip.id === "green" ? { ...clip, speed: 2 } : clip.id === "red" ? { ...clip, start: .25, end: .75, speed: .5 } : clip));
  await page.reload();
  await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
  for (const [frame, sourceTime, speed] of [[42, .45, .5], [100, 2 / 3, 2]]) {
    await seekFrame(frame);
    const video = player.getByLabel("Primary sequence video", { exact: true });
    await expect.poll(async () => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(sourceTime, 2);
    await expect.poll(async () => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(speed);
  }
  await page.getByRole("button", { name: "Close sequence", exact: true }).click();
  await save(clips.map((clip) => clip.id === "green" ? { ...clip, timelineStart: 1.5 } : clip));
  const overlapping = await page.request.post(`/api/cut/projects/${project.id}/render`, { headers, data: settings });
  expect(overlapping.status()).toBe(400); expect((await overlapping.json()).message).toContain("Primary video clips overlap");
  await info.attach("primary-gaps-receipt", { body: JSON.stringify({ jobId: job.id, probe, gapPixels: [.5, 2.5, 4.5].map(pixel), tailRms: rms(4.2, 4.8) }), contentType: "application/json" });
});
