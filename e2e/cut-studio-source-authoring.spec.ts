import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readCutCodeSourceFiles } from "../server/cut-code-package";
import { generateCutSourceLockfile } from "../shared/cut-code-lockfile";

async function fixture(page: Page, info: TestInfo) {
  const directory = info.outputPath("source-authoring"); mkdirSync(directory, { recursive: true });
  const path = `${directory}/source.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path], { timeout: 10_000 });
  const uploaded = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "video", visibility: "private", video: { name: "source.mp4", mimeType: "video/mp4", buffer: readFileSync(path) } } });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  const created = await page.request.post("/api/cut/projects", { data: { sourceAssetId: (await uploaded.json()).asset.id, name: "Source authoring qualification", duration: 1, mediaKind: "video" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const project = await created.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  await page.getByRole("button", { name: "New source package", exact: true }).click();
  return project;
}

test("source authoring saves immutable private ZIPs, reopens all files and enforces account and deletion boundaries", async ({ page }, info) => {
  const project = await fixture(page, info);
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const source = "// café 🎬\nglobalThis.__sourceMustNotExecute = true;\nexport default function Composition() { return null; }\n";
  await editor.fill(source);
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole("textbox", { name: "New source file path", exact: true }).fill("src/Title.tsx");
  await page.getByRole("button", { name: "Add source file", exact: true }).click();
  await editor.fill("export const Title = () => <h1>Native source</h1>;\n");
  await page.getByRole("button", { name: "Save new private source ZIP", exact: true }).click();
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  const asset = await page.getByRole("combobox", { name: "Code source capsule", exact: true }).inputValue();
  const url = `/api/cut/projects/${project.id}/code-sources/${asset}?entrypoint=src%2Findex.tsx`;
  const opened = await page.request.get(url);
  expect(opened.ok(), await opened.text()).toBeTruthy(); expect(opened.headers()["cache-control"]).toBe("no-store");
  const saved = await opened.json(); expect(saved.files).toHaveLength(4);
  expect(saved.files.find((file: any) => file.path === "src/index.tsx").content).toBe(source);
  expect(saved.execution).toBe("not_implemented");
  const peer = info.project.name.startsWith("mobile") ? 2 : 1;
  expect((await page.request.get(url, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);
  expect(await page.evaluate(() => (globalThis as any).__sourceMustNotExecute)).toBeUndefined();
  await page.reload();
  await page.getByRole("combobox", { name: "Code source capsule", exact: true }).selectOption(asset);
  await page.getByRole("button", { name: "Edit selected source ZIP", exact: true }).click();
  await expect(editor).toHaveValue(source);
  await editor.fill(source + "// second revision\n");
  await page.getByRole("button", { name: "Save new private source ZIP", exact: true }).click();
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  const next = await page.getByRole("combobox", { name: "Code source capsule", exact: true }).inputValue();
  expect(next).not.toBe(asset);
  expect((await (await page.request.get(url)).json()).files).toEqual(saved.files);
  const deleted = await page.request.delete(`/api/assets/${asset}`); expect(deleted.ok(), await deleted.text()).toBeTruthy();
  expect((await page.request.get(url)).status()).toBe(404);
  expect((await page.request.get(url.replace(asset, next))).ok()).toBeTruthy();
});

test("source draft survives upload failure, download and declined navigation without claiming server persistence", async ({ page }, info) => {
  await fixture(page, info);
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const original = await editor.inputValue();
  await editor.fill("é".repeat(131073));
  await expect(page.getByText("Each editable source file is limited to 256 KiB. Previous draft retained.", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue(original);
  await editor.fill(original + "// preserved after failed save\n");
  await page.route("**/api/assets/upload-intents", (route) => route.fulfill({ status: 503, json: { message: "Synthetic private storage outage" } }));
  await page.route("**/api/assets/upload-proxy", (route) => route.fulfill({ status: 503, json: { message: "Synthetic private storage outage" } }));
  await page.getByRole("button", { name: "Save new private source ZIP", exact: true }).click();
  await expect(page.getByText("Synthetic private storage outage", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsaved source draft. Save or download before leaving.", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue(original + "// preserved after failed save\n");
  const before = page.url();
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Leave without saving"); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(before);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download source ZIP", exact: true }).click();
  const downloaded = await downloading; const path = await downloaded.path(); expect(path).toBeTruthy();
  expect(readCutCodeSourceFiles(readFileSync(path!), "src/index.tsx").find((file) => file.path === "src/index.tsx")?.content).toBe(original + "// preserved after failed save\n");
  await expect(page.getByText("Unsaved source draft. Save or download before leaving.", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "New source package", exact: true }).click();
  await expect(editor).toHaveValue(original + "// preserved after failed save\n");
  await page.unroute("**/api/assets/upload-intents"); await page.unroute("**/api/assets/upload-proxy");
  await page.getByRole("button", { name: "Save new private source ZIP", exact: true }).click();
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
});

test("source lockfile pair registers exact private assets and clears stale pair selection", async ({ page }, info) => {
  const project = await fixture(page, info);
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const source = await editor.inputValue();
  const lockChoice = page.getByRole("combobox", { name: "Code dependency lockfile", exact: true });
  await expect(lockChoice).toHaveValue("");
  await page.getByRole("button", { name: "Save source + matching lockfile", exact: true }).click();
  await expect(page.getByText("New private source and matching lockfile saved and selected. You can register this code composition. Public execution remains unavailable.", { exact: true })).toBeVisible();
  const sourceId = await page.getByRole("combobox", { name: "Code source capsule", exact: true }).inputValue();
  const lockId = await lockChoice.inputValue(); expect(lockId).toBeTruthy(); expect(lockId).not.toBe(sourceId);
  const opened = await (await page.request.get(`/api/cut/projects/${project.id}/code-sources/${sourceId}?entrypoint=src%2Findex.tsx`)).json();
  expect(opened.files.find((file: any) => file.path === "src/index.tsx").content).toBe(source);
  const savedProject = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  const lockedMedia = savedProject.media.find((item: any) => item.assetId === lockId); expect(lockedMedia).toBeTruthy();
  const lockUrl = `/api/cut/projects/${project.id}/media-library/${lockedMedia.id}/media-file`;
  const downloadedLock = await page.request.get(lockUrl); expect(downloadedLock.ok(), await downloadedLock.text()).toBeTruthy();
  expect(await downloadedLock.text()).toBe(generateCutSourceLockfile(opened.files));
  const peer = info.project.name.startsWith("mobile") ? 2 : 1;
  expect((await page.request.get(lockUrl, { headers: { "x-creativesos-demo-user": String(peer) } })).status()).toBe(404);
  await page.getByRole("button", { name: "Save isolated composition", exact: true }).click();
  await expect(page.getByText(/Pinned code composition saved/)).toBeVisible();
  const runtime = await (await page.request.get(`/api/cut/projects/${project.id}/creative-runtime`)).json();
  const composition = runtime.compositions.find((row: any) => row.mode === "sandboxed_tsx");
  expect(composition.codeCapsule).toMatchObject({ sourceAssetId: sourceId, lockfileAssetId: lockId });
  expect(runtime.compositionRuntime.isolatedCode).toBe("not_implemented");
  const mismatched = JSON.parse(generateCutSourceLockfile(opened.files)); mismatched.packages["node_modules/react"].integrity = "tampered";
  const upload = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "cut-code-lockfile", visibility: "private", code_lockfile: { name: "package-lock.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mismatched)) } } });
  expect(upload.ok(), await upload.text()).toBeTruthy(); const wrong = (await upload.json()).asset.id;
  const attached = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: wrong, name: "package-lock.json", duration: 1, mediaKind: "code_lockfile" } });
  expect(attached.ok(), await attached.text()).toBeTruthy();
  const denied = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: "Mismatched source must not register", mode: "sandboxed_tsx", manifest: composition.manifest, codeCapsule: { ...composition.codeCapsule, lockfileAssetId: wrong } } });
  expect(denied.status()).toBe(400); expect(await denied.text()).toContain("do not match the pinned runtime");
  expect((await (await page.request.get(`/api/cut/projects/${project.id}/creative-runtime`)).json()).compositions).toHaveLength(runtime.compositions.length);
  await editor.fill(source + "// new source must not inherit the old lockfile\n");
  await expect(page.getByRole("button", { name: "Save isolated composition", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save new private source ZIP", exact: true }).click();
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  await expect(lockChoice).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save isolated composition", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Code source capsule", exact: true }).selectOption(sourceId);
  await expect(lockChoice).toHaveValue("");
});

test("source lockfile pair failure retains the draft and does not claim a completed pair", async ({ page }, info) => {
  await fixture(page, info);
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const source = await editor.inputValue();
  await page.route("**/api/assets/upload-intents", (route) => route.fulfill({ status: 503, json: { message: "Local proxy qualification" } }));
  await page.route("**/api/assets/upload-proxy", (route) => route.request().postData()?.includes('name="code_lockfile"')
    ? route.fulfill({ status: 503, json: { message: "Synthetic lockfile outage" } }) : route.continue());
  await page.getByRole("button", { name: "Save source + matching lockfile", exact: true }).click();
  await expect(page.getByText(/The source ZIP was saved, but the matching lockfile could not be confirmed/)).toBeVisible();
  await expect(editor).toHaveValue(source);
  await expect(page.getByText("Unsaved source draft. Save or download before leaving.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save isolated composition", exact: true })).toBeDisabled();
  await page.unroute("**/api/assets/upload-proxy");
  await page.getByRole("button", { name: "Save source + matching lockfile", exact: true }).click();
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Code dependency lockfile", exact: true })).not.toHaveValue("");
  await page.getByRole("combobox", { name: "Source editor file", exact: true }).selectOption("package.json");
  await editor.fill(JSON.stringify({ dependencies: { react: "latest" } }));
  await expect(page.getByRole("button", { name: "Save source + matching lockfile", exact: true })).toBeDisabled();
  await expect(page.getByText(/Automatic lockfiles support only React/)).toBeVisible();
});

test("source history follows file and section edits without inventing server saves", async ({ page }, info) => {
  await fixture(page, info);
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const file = page.getByRole("combobox", { name: "Source editor file", exact: true });
  const undo = page.getByRole("button", { name: "Undo source edit", exact: true });
  const redo = page.getByRole("button", { name: "Redo source edit", exact: true });
  const original = await editor.inputValue(); const first = original + "// first edit\n";
  await expect(undo).toBeDisabled(); await editor.fill(first);
  await file.selectOption("src/style.css"); const css = await editor.inputValue(); await editor.fill(css + "/* edit */\n");
  await page.getByRole("button", { name: "Flows", exact: true }).click(); await page.getByRole("button", { name: "Motion", exact: true }).click();
  await expect(file).toHaveValue("src/style.css"); await expect(editor).toHaveValue(css + "/* edit */\n");
  await undo.click(); await expect(editor).toHaveValue(css);
  await file.selectOption("src/index.tsx"); await expect(editor).toHaveValue(first);
  await editor.press("Control+z"); await expect(editor).toHaveValue(original);
  await expect(page.getByText("Unsaved source draft. Save or download before leaving.", { exact: true })).toBeVisible();
  await editor.press("Control+Shift+z"); await expect(editor).toHaveValue(first);
  await page.getByRole("button", { name: "Save new private source ZIP", exact: true }).click();
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  await editor.fill(first + "// unsaved later edit\n"); await undo.click(); await expect(editor).toHaveValue(first);
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  await redo.click(); await expect(editor).toHaveValue(first + "// unsaved later edit\n");
  await expect(page.getByText("Unsaved source draft. Save or download before leaving.", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New source package", exact: true }).click();
  await expect(undo).toBeDisabled(); await expect(redo).toBeDisabled(); await expect(editor).toHaveValue(original);
});

test("source history restores file deletion and entrypoint changes as source data", async ({ page }, info) => {
  await fixture(page, info);
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const file = page.getByRole("combobox", { name: "Source editor file", exact: true });
  const entrypoint = page.getByRole("combobox", { name: "Source editor entrypoint", exact: true });
  const undo = page.getByRole("button", { name: "Undo source edit", exact: true });
  const redo = page.getByRole("button", { name: "Redo source edit", exact: true });
  await page.getByRole("textbox", { name: "New source file path", exact: true }).fill("src/Alternate.tsx");
  await page.getByRole("button", { name: "Add source file", exact: true }).click();
  await editor.fill("export default () => null;\n"); await entrypoint.selectOption("src/Alternate.tsx");
  await undo.click(); await expect(entrypoint).toHaveValue("src/index.tsx"); await expect(editor).toHaveValue("export default () => null;\n");
  await redo.click(); await expect(entrypoint).toHaveValue("src/Alternate.tsx");
  await file.selectOption("src/style.css"); const css = await editor.inputValue();
  await expect(file.getByRole("option", { name: "src/style.css", exact: true })).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Remove selected source file", exact: true }).click();
  await expect(file.getByRole("option", { name: "src/style.css", exact: true })).toHaveCount(0);
  await undo.click(); await file.selectOption("src/style.css"); await expect(editor).toHaveValue(css);
  await expect(entrypoint).toHaveValue("src/Alternate.tsx");
  await redo.click(); await expect(file.getByRole("option", { name: "src/style.css", exact: true })).toHaveCount(0);
  await expect(entrypoint).toHaveValue("src/Alternate.tsx");
});

test("expanded source workspace preserves one draft, selected file, selection and undo history", async ({ page }, info) => {
  const project = await fixture(page, info);
  const initial = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  const editor = page.getByRole("textbox", { name: "Source file contents", exact: true });
  const file = page.getByRole("combobox", { name: "Source editor file", exact: true });
  await file.selectOption("src/style.css");
  const original = await editor.inputValue(); const edited = original + "/* expanded private draft */\n";
  await editor.fill(edited);
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(3, 9, "forward"));
  const expand = page.getByRole("button", { name: "Expand source editor", exact: true });
  await expand.click();
  const workspace = page.getByRole("dialog", { name: "Composition source workspace", exact: true });
  await expect(workspace).toBeVisible(); await expect(editor).toHaveCount(1);
  await expect(editor).toBeFocused(); await expect(editor).toHaveValue(edited); await expect(file).toHaveValue("src/style.css");
  await expect.poll(() => editor.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([3, 9]);
  await editor.press("Tab");
  await expect(workspace.getByRole("button", { name: "Remove selected source file", exact: true })).toBeFocused();
  await editor.focus();
  await expect.poll(async () => {
    const sourceBox = await editor.boundingBox();
    const viewportBox = await workspace.getByRole("region", { name: "Source workspace viewport", exact: true }).boundingBox();
    return Boolean(sourceBox && viewportBox && sourceBox.y >= viewportBox.y && sourceBox.y + 24 <= viewportBox.y + viewportBox.height);
  }, { message: "Refocused code must expose its first visible line, not clip it above the scroll viewport" }).toBe(true);
  const size = await workspace.boundingBox(); expect(size!.width).toBeGreaterThan(page.viewportSize()!.width * .9);
  expect(size!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: info.outputPath("source-workspace.png") });
  await workspace.getByRole("button", { name: "Undo source edit", exact: true }).click(); await expect(editor).toHaveValue(original);
  await workspace.getByRole("button", { name: "Redo source edit", exact: true }).click(); await expect(editor).toHaveValue(edited);
  await workspace.getByRole("button", { name: "Return to studio", exact: true }).click();
  await expect(workspace).toHaveCount(0); await expect(editor).toHaveCount(1); await expect(editor).toHaveValue(edited);
  await expect(expand).toBeFocused(); await expect(file).toHaveValue("src/style.css");
  await expand.click(); await expect(editor).toHaveValue(edited); await editor.press("Escape");
  await expect(workspace).toHaveCount(0); await expect(editor).toHaveValue(edited);
  const final = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(final.revision).toBe(initial.revision); expect(final.edl).toEqual(initial.edl); expect(final.media).toEqual(initial.media);
});

test("expanded source workspace saves the actual private package and retains it after closing", async ({ page }, info) => {
  const project = await fixture(page, info);
  await page.getByRole("button", { name: "Expand source editor", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Composition source workspace", exact: true });
  const editor = workspace.getByRole("textbox", { name: "Source file contents", exact: true });
  const source = (await editor.inputValue()) + "// private workspace save\n";
  await editor.fill(source);
  await workspace.getByRole("button", { name: "Save source + matching lockfile", exact: true }).click();
  await expect(workspace.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "Return to studio", exact: true }).click();
  const sourceId = await page.getByRole("combobox", { name: "Code source capsule", exact: true }).inputValue();
  expect(await page.getByRole("combobox", { name: "Code dependency lockfile", exact: true }).inputValue()).toBeTruthy();
  const stored = await page.request.get(`/api/cut/projects/${project.id}/code-sources/${sourceId}?entrypoint=src%2Findex.tsx`);
  expect(stored.ok(), await stored.text()).toBeTruthy();
  expect((await stored.json()).files.find((item: any) => item.path === "src/index.tsx").content).toBe(source);
  await expect(page.getByRole("textbox", { name: "Source file contents", exact: true })).toHaveValue(source);
  await expect(page.getByText("Source package saved to this project.", { exact: true })).toBeVisible();
});

test("expanded source workspace keeps the selected file usable without covering focused code", async ({ page }, info) => {
  await fixture(page, info);
  const originalViewport = page.viewportSize()!;
  await page.getByRole("button", { name: "Expand source editor", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Composition source workspace", exact: true });
  const viewport = workspace.getByRole("region", { name: "Source workspace viewport", exact: true });
  const editor = workspace.getByRole("textbox", { name: "Source file contents", exact: true });
  const file = workspace.getByRole("combobox", { name: "Source editor file", exact: true });
  const assertFileAndCode = async () => {
    await expect.poll(async () => {
      const bounds = await viewport.boundingBox(), select = await file.boundingBox(), source = await editor.boundingBox();
      if (!bounds || !select || !source) return false;
      const unobscured = await file.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
      });
      return unobscured && select.y >= bounds.y && select.y + select.height <= bounds.y + bounds.height
        && source.y >= select.y + select.height && source.y + 24 <= bounds.y + bounds.height;
    }, { message: "Selected filename and first editable line must both remain visible and unobscured" }).toBe(true);
  };
  await expect(editor).toBeFocused();
  await assertFileAndCode();
  const initial = await editor.inputValue();
  await editor.fill(initial + "// sticky workspace draft\n");
  await viewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => file.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
  })).toBe(true);
  await file.selectOption("src/style.css");
  await editor.focus(); await assertFileAndCode();
  // A reduced viewport exercises resize layout, not a claim of physical mobile
  // keyboard coverage. Keep the same focused editor and unchanged draft.
  await page.setViewportSize({ ...originalViewport, height: 480 });
  await assertFileAndCode();
  await page.setViewportSize(originalViewport);
  await file.selectOption("src/index.tsx");
  await editor.focus(); await assertFileAndCode();
  await expect(editor).toHaveValue(initial + "// sticky workspace draft\n");
  await page.screenshot({ path: info.outputPath("source-workspace-file-bar.png") });
  await workspace.getByRole("button", { name: "Return to studio", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source file contents", exact: true })).toHaveValue(initial + "// sticky workspace draft\n");
});
