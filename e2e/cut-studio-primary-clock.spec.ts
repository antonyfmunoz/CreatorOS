import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { downloadCutRender, waitForCutRender } from "./helpers/cut-render";

for (const fps of [24, 60]) {
  test(`primary preview clock matches the selected ${fps} fps export`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const directory = info.outputPath("primary-clock"); mkdirSync(directory, { recursive: true });
    const source = `${directory}/clock-blue.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=120:d=1", "-c:v", "libx264",
      "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", source], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
    const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private",
      video: { name: "clock-blue.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
    expect(upload.status()).toBe(201); const asset = (await upload.json()).asset;
    const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: `Preview clock ${fps}`, duration: 1, mediaKind: "video" } });
    expect(created.ok()).toBe(true); const project = await created.json();
    await page.goto(`/cut-studio?project=${project.id}`);
    await page.getByLabel("Render frame rate", { exact: true }).selectOption(String(fps));
    await page.getByLabel("Render resolution", { exact: true }).selectOption("720p");
    await page.getByLabel("Render quality", { exact: true }).selectOption("draft");
    await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
    const player = page.getByRole("region", { name: "Primary sequence player", exact: true });
    await expect(player).toHaveAttribute("data-preview-fps", String(fps));
    const slider = player.getByRole("slider", { name: "Sequence frame", exact: true });
    await expect(slider).toHaveAttribute("max", String(fps - 1));
    await slider.press("End");
    await expect(player).toHaveAttribute("data-preview-frame", String(fps - 1));
    const video = player.getByLabel("Primary sequence video", { exact: true });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo((fps - 1) / fps, 3);
    await player.getByRole("button", { name: "Previous sequence frame", exact: true }).click();
    await expect(player).toHaveAttribute("data-preview-frame", String(fps - 2));
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo((fps - 2) / fps, 3);
    await player.screenshot({ path: `${directory}/preview-clock.png` });
    await slider.press("Home");
    await player.getByRole("button", { name: "Play sequence", exact: true }).click();
    await expect.poll(async () => Number(await player.getAttribute("data-preview-frame"))).toBeGreaterThan(0);
    await expect(player).toHaveAttribute("data-preview-state", "paused", { timeout: 10_000 });
    await expect(player).toHaveAttribute("data-preview-frame", String(fps - 1));
    await page.getByRole("button", { name: "Close sequence", exact: true }).click();
    const submitted = page.waitForResponse(response => response.url().endsWith(`/api/cut/projects/${project.id}/render`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Render full edit", exact: true }).click();
    const response = await submitted;
    expect(response.status()).toBe(202); expect(response.request().postDataJSON().fps).toBe(fps);
    const job = await response.json(); await waitForCutRender(page.request, job.id, info);
    const finished = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(finished.state).toBe("done");
    const output = await downloadCutRender(page.request, job.id, `${directory}/clock-render.mp4`);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
      "stream=codec_name,r_frame_rate,nb_read_frames,duration", "-of", "json", output], { windowsHide: true, timeout: 10_000, encoding: "utf8" }));
    const stream = probe.streams[0];
    expect(stream.codec_name).toBe("h264"); expect(stream.r_frame_rate).toBe(`${fps}/1`);
    expect(Number(stream.nb_read_frames)).toBe(fps); expect(Number(stream.duration)).toBeCloseTo(1, 3);
    const otherOwner = info.project.name.startsWith("mobile") ? "2" : "1";
    const denied = await page.request.get(`/api/cut/jobs/${job.id}/media-file`, { headers: { "x-creativesos-demo-user": otherOwner } });
    expect(denied.status()).toBe(404);
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ fps, finalPreviewFrame: fps - 1, stream, crossOwnerStatus: denied.status(), jobId: job.id }, null, 2));
  });
}
