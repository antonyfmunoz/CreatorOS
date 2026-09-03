import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("primary preview applies native-clock transforms to supported layered video", async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath("primary-layered-video");
  mkdirSync(directory, { recursive: true });
  const createVideo = (name: string, color: string) => {
    const path = `${directory}/${name}.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=${color}:s=160x90:r=30:d=1`, "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", path], { windowsHide: true, timeout: 10_000, stdio: "pipe" });
    return path;
  };
  const upload = async (name: string, color: string) => {
    const path = createVideo(name, color);
    const response = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: `${name}.mp4`, mimeType: "video/mp4", buffer: readFileSync(path) } } });
    expect(response.status()).toBe(201);
    return (await response.json()).asset;
  };
  const primary = await upload("layer-primary", "blue");
  const overlay = await upload("layer-overlay", "red");
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: primary.id, name: "Primary layered video", duration: 1, mediaKind: "video" } });
  expect(created.ok()).toBe(true);
  const project = await created.json();
  const added = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: overlay.id, name: "Red layered video", duration: 1, mediaKind: "video" } });
  expect(added.ok()).toBe(true);
  const current = await page.request.get(`/api/cut/projects/${project.id}`);
  expect(current.ok()).toBe(true);
  const loaded = await current.json();
  const saved = await page.request.put(`/api/cut/projects/${project.id}/edl`, {
    headers: { "If-Match": String(loaded.revision) },
    data: {
      version: 3,
      clips: [
        { id: "primary", start: 0, end: 1, timelineStart: 0 },
        { id: "moving-overlay", assetId: overlay.id, start: 0, end: 1, track: "v2", timelineStart: 0, transform: { x: .1, y: .2, width: .3, height: .4, opacity: .8 }, motionKeyframes: [{ at: .5, x: .5, y: .4, scale: 1.5, opacity: .5, easing: "ease_in_out" }] },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);

  await page.goto(`/cut-studio?project=${project.id}`);
  await page.getByRole("button", { name: "Preview primary sequence", exact: true }).click();
  const player = page.getByRole("region", { name: "Primary sequence player", exact: true });
  const video = player.locator('[data-primary-preview-overlay="moving-overlay"]');
  await expect(video).toBeVisible();
  expect(await video.evaluate((element: HTMLElement) => element.style.left)).toBe("10%");
  expect(await video.evaluate((element: HTMLElement) => element.style.top)).toBe("20%");
  await player.getByRole("slider", { name: "Sequence frame", exact: true }).press("End");
  await expect(player).toHaveAttribute("data-preview-frame", "29");
  expect(await video.evaluate((element: HTMLElement) => element.style.left)).toBe("50%");
  expect(await video.evaluate((element: HTMLElement) => element.style.top)).toBe("40%");
  await expect(video).toHaveCSS("opacity", "0.5");
  expect(await video.evaluate((element: HTMLElement) => element.style.transform)).toContain("scale(1.5)");
  await player.getByLabel("Primary sequence canvas", { exact: true }).screenshot({ path: `${directory}/layered-frame-29.png` });
  const otherOwner = info.project.name.startsWith("mobile") ? "2" : "1";
  const denied = await page.request.get(`/api/cut/projects/${project.id}`, { headers: { "x-creativesos-demo-user": otherOwner } });
  expect(denied.status()).toBe(404);
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ projectId: project.id, frame: 29, crossOwnerStatus: denied.status() }, null, 2));
});
