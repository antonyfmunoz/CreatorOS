import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

for (const gapped of [false, true]) {
  test(`primary cross-dissolve preview matches ${gapped ? "black-gap" : "held-source"} native pixels`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const directory = info.outputPath("primary-dissolve"); mkdirSync(directory, { recursive: true });
    const assets = [];
    for (const color of ["blue", "red"]) {
      const source = `${directory}/${color}.mp4`;
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=${color}:s=160x90:r=60:d=1`,
        "-f", "lavfi", "-i", `sine=frequency=${color === "blue" ? 440 : 880}:sample_rate=48000:duration=1`,
        "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source],
        { windowsHide: true, timeout: 10_000, stdio: "pipe" });
      const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private",
        video: { name: `dissolve-${color}.mp4`, mimeType: "video/mp4", buffer: readFileSync(source) } } });
      expect(upload.status()).toBe(201); assets.push((await upload.json()).asset);
    }
    const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: assets[0].id, name: `Dissolve ${gapped}`, duration: 1, mediaKind: "video" } });
    expect(created.ok()).toBe(true); const project = await created.json();
    const linked = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: assets[1].id, name: "Red", duration: 1, mediaKind: "video" } });
    expect(linked.ok()).toBe(true);
    const start = gapped ? 1.5 : 1;
    const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(project.revision) }, data: { version: 3, clips: [
      { id: "blue", assetId: assets[0].id, start: 0, end: 1, timelineStart: 0 },
      { id: "red", assetId: assets[1].id, start: 0, end: 1, timelineStart: start, transition: "cross_dissolve" },
    ] } });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.goto(`/cut-studio?project=${project.id}`);
    await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
    const player = page.getByRole("region", { name: "Primary sequence player", exact: true });
    await expect(player).toBeVisible();
    const slider = player.getByRole("slider", { name: "Sequence frame", exact: true });
    const frames = [Math.round(start * 30), Math.round((start + .2) * 30), Math.round((start + .5) * 30)];
    const preview: Array<{ frame: number; rgb: number[]; outgoingTime: number | null; nativeRgb?: number[] }> = [];
    let current = 0;
    for (const frame of frames) {
      for (let i = current; i < frame; i++) await slider.press("ArrowRight"); current = frame;
      await expect(player).toHaveAttribute("data-preview-frame", String(frame));
      const video = player.getByLabel("Primary sequence video", { exact: true });
      await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && !element.seeking)).toBe(true);
      const outgoing = player.getByLabel("Outgoing sequence video", { exact: true });
      let outgoingTime: number | null = null;
      if (!gapped && frame < frames[2]) {
        await expect.poll(() => outgoing.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && !element.seeking)).toBe(true);
        outgoingTime = await outgoing.evaluate((element: HTMLVideoElement) => element.currentTime);
        expect(outgoingTime).toBeCloseTo(29 / 30, 3);
        expect(await outgoing.evaluate((element: HTMLVideoElement) => element.muted && element.paused)).toBe(true);
      } else await expect(outgoing).toHaveCount(0);
      const screenshot = await player.getByLabel("Primary sequence canvas", { exact: true }).screenshot();
      writeFileSync(`${directory}/preview-${frame}.png`, screenshot);
      const { data, info: image } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const offset = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * image.channels;
      preview.push({ frame, rgb: [...data.subarray(offset, offset + 3)], outgoingTime });
    }
    expect(preview[0].rgb[0]).toBeLessThan(10);
    if (gapped) expect(preview[0].rgb[2]).toBeLessThan(10);
    else expect(preview[0].rgb[2]).toBeGreaterThan(240);
    expect(preview[1].rgb[0]).toBeGreaterThan(100); expect(preview[1].rgb[0]).toBeLessThan(220);
    expect(preview[2].rgb[0]).toBeGreaterThan(240); expect(preview[2].rgb[2]).toBeLessThan(10);
    await slider.press("Home"); await player.getByRole("button", { name: "Play sequence", exact: true }).click();
    await expect.poll(async () => Number(await player.getAttribute("data-preview-frame"))).toBeGreaterThan(frames[1]);
    await player.getByRole("button", { name: "Pause sequence", exact: true }).click();
    await page.getByRole("button", { name: "Close sequence", exact: true }).click();
    const submitted = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: "16:9", resolution: "720p", fps: 30, captions: false, quality: "draft" } });
    expect(submitted.status()).toBe(202); const job = await submitted.json(); await waitForCutRender(page.request, job.id, info);
    const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(finished.state).toBe("done");
    const output = await downloadCutRender(page.request, job.id, `${directory}/render.mp4`);
    for (const sample of preview) {
      const pixel = execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-i", output, "-vf",
        `select=eq(n\\,${sample.frame}),crop=2:2:iw/2:ih/2,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"],
        { windowsHide: true, timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
      sample.nativeRgb = [...pixel.subarray(0, 3)];
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(sample.rgb[channel] - sample.nativeRgb[channel]), `Frame ${sample.frame} channel ${channel}`).toBeLessThanOrEqual(12);
    }
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ gapped, jobId: job.id, preview }, null, 2));
  });
}
