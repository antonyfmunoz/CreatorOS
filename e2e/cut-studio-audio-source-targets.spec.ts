import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

for (const format of ["mp4", "webm"] as const) for (const aspect of ["9:16", "1:1"] as const) {
  test(`CutStudio audio source honors ${format} ${aspect} framing and timed captions`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const directory = info.outputPath("audio-source"); mkdirSync(directory, { recursive: true });
    const source = `${directory}/source.wav`;
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
      "-c:a", "pcm_s16le", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
    const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "audio", visibility: "private",
      audio: { name: "audio-source.wav", mimeType: "audio/wav", buffer: readFileSync(source) } } });
    expect(upload.status()).toBe(201); const asset = (await upload.json()).asset;
    const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id,
      name: `Audio ${format} ${aspect}`, duration: 1, mediaKind: "audio" } });
    expect(created.ok()).toBe(true); const project = await created.json();
    const saved = await page.request.put(`/api/cut/projects/${project.id}/transcript`, { headers: { "If-Match": String(project.revision) },
      data: { duration: 1, language: "en", segments: [{ id: "voice", start: 0.2, end: 0.8, text: "Voice caption",
        words: [{ word: "Voice", start: 0.2, end: 0.5 }, { word: "caption", start: 0.5, end: 0.8 }] }] } });
    expect(saved.ok(), await saved.text()).toBe(true);
    const fps = format === "mp4" ? 25 : 50;
    const submitted = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: {
      format, aspect, fps, resolution: "720p", quality: "draft", captions: true, captionStyle: 1,
      audioPreset: "original", audioBitrateKbps: 128,
    } });
    expect(submitted.status()).toBe(202); const job = await submitted.json();
    await waitForCutRender(page.request, job.id, info);
    const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(finished.state).toBe("done");
    const file = await downloadCutRender(page.request, job.id, `${directory}/output.${format}`);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8", windowsHide: true, timeout: 10_000 }));
    const video = probe.streams.find((stream: any) => stream.codec_type === "video");
    const audio = probe.streams.find((stream: any) => stream.codec_type === "audio");
    expect(video).toMatchObject({ width: aspect === "9:16" ? 406 : 720, height: 720, r_frame_rate: `${fps}/1`, codec_name: format === "webm" ? "vp9" : "h264" });
    expect(Number(video.nb_read_frames)).toBe(fps);
    expect(audio.codec_name).toBe(format === "webm" ? "opus" : "aac");
    expect(Math.abs(Number(probe.format.duration) - 1)).toBeLessThan(0.1);
    const brightPixels = (frame: number) => {
      const pixels = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame}),format=gray`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"],
        { windowsHide: true, timeout: 10_000, maxBuffer: 2_000_000, stdio: ["ignore", "pipe", "pipe"] });
      return [...pixels].filter(value => value > 180).length;
    };
    const openingBright = brightPixels(0), captionBright = brightPixels(Math.floor(fps / 2));
    expect(openingBright).toBe(0); expect(captionBright).toBeGreaterThan(100);
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"],
      { windowsHide: true, timeout: 10_000, maxBuffer: 1_000_000, stdio: ["ignore", "pipe", "pipe"] });
    let energy = 0; for (let offset = 0; offset + 4 <= pcm.length; offset += 4) energy += pcm.readFloatLE(offset) ** 2;
    const rms = Math.sqrt(energy / (pcm.length / 4)); expect(rms).toBeGreaterThan(0.03);
    const otherOwner = info.project.name.startsWith("mobile") ? "2" : "1";
    const denied = await page.request.get(`/api/cut/jobs/${job.id}/media-file`, { headers: { "x-creativesos-demo-user": otherOwner } });
    expect(denied.status()).toBe(404);
    await page.goto(`/cut-studio?project=${project.id}`);
    await page.getByRole("button", { name: `Preview rendered video ${finished.output.filename}`, exact: true }).click();
    const player = page.getByLabel("Rendered video preview", { exact: true });
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState >= 2)).toBe(true);
    await player.focus(); await player.press("Space");
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.ended)).toBe(true);
    expect(await player.evaluate((element: HTMLVideoElement) => element.error?.code ?? null)).toBe(null);
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ jobId: job.id, format, aspect, fps, width: video.width, height: video.height,
      frames: Number(video.nb_read_frames), openingBright, captionBright, rms, privateDenied: denied.status() }, null, 2));
    await page.screenshot({ path: `${directory}/preview.png` });
  });
}
