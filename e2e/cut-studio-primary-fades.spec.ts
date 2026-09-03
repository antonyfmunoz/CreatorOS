import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

for (const gapped of [false, true]) {
  test(`primary fade-black preview agrees with ${gapped ? "gapped" : "contiguous"} native export`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const directory = info.outputPath("primary-fades"); mkdirSync(directory, { recursive: true });
    const source = `${directory}/blue.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=60:d=1", "-f", "lavfi", "-i",
      "sine=frequency=440:sample_rate=48000:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
    const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private",
      video: { name: "fade-blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
    expect(upload.status()).toBe(201); const asset = (await upload.json()).asset;
    const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: `Primary fades ${gapped}`, duration: 1, mediaKind: "video" } });
    expect(created.ok()).toBe(true); const project = await created.json();
    const firstStart = gapped ? .5 : 0, secondStart = gapped ? 2 : 1;
    const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(project.revision) }, data: {
      version: 3, clips: [
        { id: "first", start: 0, end: 1, timelineStart: firstStart, transition: "fade_black" },
        { id: "second", start: 0, end: 1, timelineStart: secondStart, transition: "fade_black" },
      ],
    } });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.goto(`/cut-studio?project=${project.id}`);
    await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
    const player = page.getByRole("region", { name: "Primary sequence player", exact: true });
    await expect(player).toBeVisible();
    const slider = player.getByRole("slider", { name: "Sequence frame", exact: true });
    const preview: Array<{ frame: number; blue: number; opacity: number }> = [];
    const frames = [Math.round((firstStart + .5) * 30), Math.round((firstStart + .8) * 30),
      Math.round((secondStart + .2) * 30), Math.round((secondStart + .5) * 30)];
    let current = 0;
    for (const frame of frames) {
      for (let i = current; i < frame; i++) await slider.press("ArrowRight");
      current = frame;
      await expect(player).toHaveAttribute("data-preview-frame", String(frame));
      const video = player.getByLabel("Primary sequence video", { exact: true });
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
      const local = frame / 30 - (frame / 30 >= secondStart ? secondStart : firstStart);
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(local, 2);
      const screenshot = await player.getByLabel("Primary sequence canvas", { exact: true }).screenshot();
      writeFileSync(`${directory}/preview-${frame}.png`, screenshot);
      const { data, info: image } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const offset = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * image.channels;
      preview.push({ frame, blue: data[offset + 2], opacity: await video.evaluate(element => Number(getComputedStyle(element).opacity)) });
    }
    expect(preview[0].blue).toBeGreaterThan(240); expect(preview[3].blue).toBeGreaterThan(240);
    for (const item of [preview[1], preview[2]]) { expect(item.blue).toBeGreaterThan(100); expect(item.blue).toBeLessThan(180); }
    await slider.press("Home"); await player.getByRole("button", { name: "Play sequence", exact: true }).click();
    await expect.poll(async () => Number(await player.getAttribute("data-preview-frame"))).toBeGreaterThan(10);
    await player.getByRole("button", { name: "Pause sequence", exact: true }).click();
    await expect(player).toHaveAttribute("data-preview-state", "paused");
    await page.getByRole("button", { name: "Close sequence", exact: true }).click();
    const submitted = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30,
      captions: false, quality: "draft", audioPreset: "original" } });
    expect(submitted.status()).toBe(202); const job = await submitted.json();
    await waitForCutRender(page.request, job.id, info);
    const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(finished.state).toBe("done");
    const output = await downloadCutRender(page.request, job.id, `${directory}/render.mp4`);
    const comparison = preview.map(item => {
      const pixel = execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-vf",
        `select=eq(n\\,${item.frame}),crop=2:2:iw/2:ih/2,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"],
        { windowsHide: true, timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
      expect(Math.abs(item.blue - pixel[2]), `Preview/native fade at frame ${item.frame}`).toBeLessThanOrEqual(12);
      return { ...item, nativeBlue: pixel[2] };
    });
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-map", "0:a", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"],
      { windowsHide: true, timeout: 10_000, maxBuffer: 2_000_000, stdio: ["ignore", "pipe", "pipe"] });
    const rms = (start: number, end: number) => {
      const from = Math.round(start * 48000), until = Math.round(end * 48000);
      let energy = 0; for (let i = from; i < until; i++) energy += pcm.readFloatLE(i * 4) ** 2;
      return Math.sqrt(energy / (until - from));
    };
    const baseline = rms(firstStart + .4, firstStart + .6), fading = rms(firstStart + .9, firstStart + .95);
    expect(baseline).toBeGreaterThan(.03); expect(fading / baseline).toBeGreaterThan(.05); expect(fading / baseline).toBeLessThan(.5);
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ gapped, jobId: job.id, comparison, baseline, fading }, null, 2));
  });
}
