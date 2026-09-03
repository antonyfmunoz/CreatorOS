import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

test("CutStudio exports selected AAC targets and 25/50 fps through both render paths", async ({ page }, info) => {
  test.setTimeout(150_000);
  const directory = info.outputPath("encoding"); mkdirSync(directory, { recursive: true });
  const source = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=128x72:r=30:d=2",
    "-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=48000:duration=2:amplitude=0.1:seed=487",
    "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-shortest", source],
    { windowsHide: true, timeout: 10_000, stdio: "pipe" });
  const uploaded = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private",
    video: { name: "encoding-source.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(uploaded.status()).toBe(201); const asset = (await uploaded.json()).asset;
  const evidence: Array<{ target: number; fps: number; bitrate: number; frames: number; path: string }> = [];
  for (const config of [{ target: 96, fps: 25, multitrack: false }, { target: 320, fps: 50, multitrack: true }]) {
    const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: `Encoding ${config.target}`, duration: 2, mediaKind: "video" } });
    expect(created.ok()).toBe(true); const project = await created.json();
    if (config.multitrack) {
      const edl = { ...project.edl, version: 3, clips: [
        { ...project.edl.clips[0], volume: 0 },
        { id: "encoding-sound", assetId: asset.id, start: 0, end: 2, track: "a1", timelineStart: 0, volume: 1 },
      ] };
      const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(project.revision) }, data: edl });
      expect(saved.ok()).toBe(true);
    }
    const rejected = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { audioBitrateKbps: 999 } });
    expect(rejected.status()).toBe(400);
    await page.goto(`/cut-studio?project=${project.id}`);
    const render = page.getByRole("button", { name: "Render full edit", exact: true });
    await expect(render).toBeEnabled();
    await page.getByLabel("Render quality", { exact: true }).selectOption("draft");
    await page.getByLabel("Render resolution", { exact: true }).selectOption("720p");
    await page.getByLabel("Aspect ratio", { exact: true }).selectOption("source");
    await page.getByLabel("Render frame rate", { exact: true }).selectOption(String(config.fps));
    await page.getByLabel("Render audio bitrate", { exact: true }).selectOption(String(config.target));
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/cut/projects/${project.id}/render`));
    await render.click(); const response = await submitted; expect(response.ok()).toBe(true);
    const job = await response.json();
    expect(job.request).toMatchObject({ quality: "draft", fps: config.fps, audioBitrateKbps: config.target });
    await waitForCutRender(page.request, job.id, info);
    const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json();
    expect(finished.state).toBe("done");
    expect(finished.output).toMatchObject({ audioTargetBitrateKbps: config.target, fps: config.fps });
    expect(finished.output.multitrack === true).toBe(config.multitrack);
    const output = await downloadCutRender(page.request, job.id, `${directory}/${config.target}.mp4`);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-of", "json", output], { windowsHide: true, timeout: 10_000, encoding: "utf8" }));
    const video = probe.streams.find((stream: any) => stream.codec_type === "video");
    const audio = probe.streams.find((stream: any) => stream.codec_type === "audio");
    expect(video.codec_name).toBe("h264"); expect(video.r_frame_rate).toBe(`${config.fps}/1`);
    expect(Number(video.nb_read_frames)).toBe(config.fps * 2);
    expect(audio.codec_name).toBe("aac"); expect(Number(audio.bit_rate)).toBeGreaterThan(0);
    evidence.push({ target: config.target, fps: config.fps, bitrate: Number(audio.bit_rate), frames: Number(video.nb_read_frames), path: config.multitrack ? "multitrack" : "single" });
    writeFileSync(`${directory}/receipt.json`, JSON.stringify(evidence, null, 2));
  }
  // This checks that the setting changes the encoder's actual output, not just
  // its request or receipt. AAC targets are not exact measured bitrate promises.
  expect(evidence[1].bitrate).toBeGreaterThan(evidence[0].bitrate * 1.5);
});
