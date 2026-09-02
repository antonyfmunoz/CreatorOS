import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { test, expect, type Page, type TestInfo } from "@playwright/test";

async function projectFixture(page: Page, info: TestInfo) {
  const directory = info.outputPath("recovery"); mkdirSync(directory, { recursive: true });
  const source = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-pix_fmt", "yuv420p", source], { timeout: 10_000 });
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "recovery.mp4", mimeType: "video/mp4", buffer: readFileSync(source) } } });
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const asset = (await upload.json()).asset;
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: asset.id, name: "Recovery qualification", duration: 1, mediaKind: "video" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}
async function holdDraft(page: Page, project: { id: string }) {
  await page.goto(`/cut-studio?project=${project.id}`);
  const toggle = page.getByRole("switch", { name: "Keep timeline recovery copies on this device", exact: true });
  await expect(toggle).not.toBeChecked(); await toggle.click(); await expect(toggle).toBeChecked();
  await page.route(`**/projects/${project.id}/edl`, (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic save outage" }) }) : route.continue());
  const gain = page.getByRole("slider", { name: "V1 track gain", exact: true });
  await gain.press("ArrowLeft");
  await expect(page.getByText("Current timeline recovery copy kept on this device. Not yet saved to the server.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry saving edit", exact: true })).toBeVisible();
  return gain.inputValue();
}
async function localCopies(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("creativesos:cut-recovery:v1:") && !key.endsWith(":enabled")).map((key) => JSON.parse(localStorage.getItem(key)!)));
}

test("opt-in device recovery survives page loss and saves only after explicit restoration", async ({ page, context }, info) => {
  const project = await projectFixture(page, info);
  const draft = await holdDraft(page, project);
  expect(await localCopies(page)).toHaveLength(1);
  const unchanged = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(unchanged.revision).toBe(project.revision);
  // Closing without beforeunload simulates the loss of the page's in-memory
  // state, not a successful server save or an orderly recovery callback.
  await page.close();
  const next = await context.newPage();
  await next.goto(`/cut-studio?project=${project.id}`);
  const restore = next.getByRole("button", { name: "Restore and save timeline copy", exact: true });
  await expect(restore).toBeEnabled();
  await expect(next.getByRole("slider", { name: "V1 track gain", exact: true })).toHaveValue("1");
  expect((await (await next.request.get(`/api/cut/projects/${project.id}`)).json()).revision).toBe(project.revision);
  await restore.click();
  await expect(next.getByText("Saved", { exact: true })).toBeVisible();
  await expect(next.getByRole("slider", { name: "V1 track gain", exact: true })).toHaveValue(draft);
  await expect.poll(() => localCopies(next)).toEqual([]);
  const saved = await (await next.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(saved.revision).toBe(project.revision + 1);
  expect(saved.edl.tracks.find((track: any) => track.track === "v1").gain).toBe(Number(draft));
  await next.reload(); await expect(next.getByRole("slider", { name: "V1 track gain", exact: true })).toHaveValue(draft);
  await next.close();
});

test("recovery refuses a fresh server conflict and retains a downloadable local copy", async ({ page, context }, info) => {
  const project = await projectFixture(page, info); await holdDraft(page, project); await page.close();
  const next = await context.newPage(); await next.goto(`/cut-studio?project=${project.id}`);
  const restore = next.getByRole("button", { name: "Restore and save timeline copy", exact: true });
  await expect(restore).toBeEnabled();
  const serverEdit = { ...project.edl, version: 3, tracks: [{ track: "v1", gain: .6 }] };
  const changed = await next.request.put(`/api/cut/projects/${project.id}/edl`, { headers: { "If-Match": String(project.revision) }, data: serverEdit });
  expect(changed.ok(), await changed.text()).toBeTruthy();
  await restore.click();
  await expect(next.getByText("Another edit was saved to the server. Recovery was not applied; download the copy for comparison or reopen this project.", { exact: true })).toBeVisible();
  expect(await localCopies(next)).toHaveLength(1);
  const download = next.waitForEvent("download");
  await next.getByRole("button", { name: "Download recovery copy", exact: true }).click();
  const file = await download;
  const bytes = readFileSync((await file.path())!, "utf8");
  expect(JSON.parse(bytes).baseRevision).toBe(project.revision);
  const current = await (await next.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(current.revision).toBe(project.revision + 1);
  expect(current.edl.tracks.find((track: any) => track.track === "v1").gain).toBe(.6);
  await next.reload(); await expect(restore).toBeDisabled();
  await expect(next.getByText(/The server has changed\. Download this copy for comparison/)).toBeVisible();
  await next.close();
});

test("two tabs retain separate drafts and opt-out deletes only device copies", async ({ page, context }, info) => {
  const project = await projectFixture(page, info); await holdDraft(page, project);
  const second = await context.newPage();
  try {
    await second.goto(`/cut-studio?project=${project.id}`);
    await expect(second.getByRole("switch", { name: "Keep timeline recovery copies on this device", exact: true })).toBeChecked();
    await second.route(`**/projects/${project.id}/edl`, (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Second synthetic save outage" }) }) : route.continue());
    const gain = second.getByRole("slider", { name: "V1 track gain", exact: true });
    await gain.press("ArrowLeft"); await gain.press("ArrowLeft");
    await expect.poll(async () => (await localCopies(second)).length).toBe(2);
    const copies = await localCopies(second);
    expect(new Set(copies.map((copy) => copy.writerId)).size).toBe(2);
    expect(copies.map((copy) => copy.edl.tracks.find((track: any) => track.track === "v1").gain).sort()).toEqual([.9, .95]);
    await second.evaluate(() => localStorage.setItem("unrelated-draft", "retain"));
    second.once("dialog", (dialog) => dialog.accept());
    await second.getByRole("switch", { name: "Keep timeline recovery copies on this device", exact: true }).click();
    await expect.poll(() => localCopies(second)).toEqual([]);
    await expect(page.getByRole("switch", { name: "Keep timeline recovery copies on this device", exact: true })).not.toBeChecked();
    expect(await second.evaluate(() => localStorage.getItem("unrelated-draft"))).toBe("retain");
    expect((await (await second.request.get(`/api/cut/projects/${project.id}`)).json()).revision).toBe(project.revision);
  } finally { await second.close(); }
});

test("unavailable browser storage never claims a device recovery save", async ({ page }, info) => {
  const project = await projectFixture(page, info);
  await page.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException("Synthetic full device storage", "QuotaExceededError"); }; });
  await page.goto(`/cut-studio?project=${project.id}`);
  const toggle = page.getByRole("switch", { name: "Keep timeline recovery copies on this device", exact: true });
  await toggle.click();
  await expect(page.getByText("Browser storage is unavailable. Recovery settings were not changed.", { exact: true })).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("slider", { name: "V1 track gain", exact: true }).press("ArrowLeft");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await localCopies(page)).toEqual([]);
});
