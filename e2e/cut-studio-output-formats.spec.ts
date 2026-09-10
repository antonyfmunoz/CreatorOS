import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

for (const format of ["mp4", "webm"] as const) for (const multitrack of [false, true]) {
  test(`CutStudio exports playable ${format.toUpperCase()} through the ${multitrack ? "multitrack" : "single-source"} path`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const directory = info.outputPath("container"); mkdirSync(directory, { recursive: true });
    const source = `${directory}/source.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=128x72:r=30:d=0.5",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.5", "-c:v", "libx264", "-threads", "1",
      "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
    const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private",
      video: { name: "format-source.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
    expect(upload.status()).toBe(201); const asset = (await upload.json()).asset;
    const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id,
      name: `Container ${format} ${multitrack ? "multi" : "single"}`, duration: 0.5, mediaKind: "video" } });
    expect(created.ok()).toBe(true); const project = await created.json();
    if (multitrack) {
      const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(project.revision) },
        data: { ...project.edl, version: 3, clips: [{ ...project.edl.clips[0], volume: 0 },
          { id: "sound", assetId: asset.id, start: 0, end: 0.5, track: "a1", timelineStart: 0, volume: 1 }] } });
      expect(saved.ok()).toBe(true);
    }
    const invalid = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { format: "../../private" } });
    expect(invalid.status()).toBe(400);
    await page.goto(`/cut-studio?project=${project.id}`);
    await expect(page.getByRole("button", { name: "Render full edit", exact: true })).toBeEnabled();
    await page.getByLabel("Render quality", { exact: true }).selectOption("draft");
    await page.getByLabel("Render resolution", { exact: true }).selectOption("720p");
    await page.getByLabel("Render aspect ratio", { exact: true }).selectOption("source");
    await page.getByLabel("Render output format", { exact: true }).selectOption(format);
    await page.getByLabel("Render audio bitrate", { exact: true }).selectOption("128");
    await expect(page.getByLabel("Render audio bitrate").locator('option:checked')).toHaveText(`128 kbps ${format === "webm" ? "Opus" : "AAC"}`);
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/cut/projects/${project.id}/render`));
    await page.getByRole("button", { name: "Render full edit", exact: true }).click();
    const response = await submitted; expect(response.status()).toBe(202); const job = await response.json();
    expect(job.request.format).toBe(format);
    await waitForCutRender(page.request, job.id, info);
    const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(finished.state).toBe("done");
    expect(finished.output.filename.endsWith(`.${format}`)).toBe(true);
    const media = await page.request.get(`/api/cut/jobs/${job.id}/media-file`); expect(media.ok()).toBe(true);
    expect(media.headers()["content-type"]).toContain(`video/${format}`);
    const file = await downloadCutRender(page.request, job.id, `${directory}/output.${format}`);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8", windowsHide: true, timeout: 10_000 }));
    const video = probe.streams.find((stream: any) => stream.codec_type === "video");
    const audio = probe.streams.find((stream: any) => stream.codec_type === "audio");
    expect(probe.format.format_name).toContain(format);
    expect(video.codec_name).toBe(format === "webm" ? "vp9" : "h264");
    expect(audio.codec_name).toBe(format === "webm" ? "opus" : "aac");
    expect(Number(video.nb_read_frames)).toBe(15); expect(video.r_frame_rate).toBe("30/1");
    const pixel = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "crop=2:2:(iw-2)/2:(ih-2)/2,format=rgb24",
      "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { windowsHide: true, timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
    expect(pixel[2]).toBeGreaterThan(180); expect(pixel[0]).toBeLessThan(50); expect(pixel[1]).toBeLessThan(50);
    const otherOwner = info.project.name.startsWith("mobile") ? "2" : "1";
    const denied = await page.request.get(`/api/cut/jobs/${job.id}/media-file`, { headers: { "x-creativesos-demo-user": otherOwner } });
    expect(denied.status()).toBe(404);
    await page.getByRole("button", { name: `Preview rendered video ${finished.output.filename}`, exact: true }).click();
    const player = page.getByLabel("Rendered video preview", { exact: true });
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState >= 2)).toBe(true);
    await player.focus(); await player.press("Space");
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.ended)).toBe(true);
    const playback = await player.evaluate((element: HTMLVideoElement) => ({ duration: element.duration, error: element.error?.code ?? null, ended: element.ended }));
    expect(playback.error).toBe(null); expect(Math.abs(playback.duration - 0.5)).toBeLessThan(0.1);
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ format, multitrack, jobId: job.id,
      videoCodec: video.codec_name, audioCodec: audio.codec_name, frames: Number(video.nb_read_frames), playback,
      centerPixel: [...pixel.subarray(0, 3)], privateDenied: denied.status() }, null, 2));
    await page.screenshot({ path: `${directory}/preview.png` });
  });
}
