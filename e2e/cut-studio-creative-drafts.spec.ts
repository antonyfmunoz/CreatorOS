import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

async function setup(page: Page, info: TestInfo) {
  const directory = info.outputPath('creative-drafts'); mkdirSync(directory, { recursive: true });
  const file = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
  const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(file) } } });
  expect(upload.ok()).toBeTruthy(); const asset = (await upload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: asset.id, name: 'Creative draft custody', duration: 1, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const rows = [];
  for (const name of ['First composition', 'Second composition']) {
    const response = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name, manifest: { version: 1, name, width: 1280, height: 720, fps: 30, durationInFrames: 30, layers: [{ id: 'title', kind: 'text', name: 'Title', text: name, from: 0, durationInFrames: 30, x: .1, y: .1, width: .8, height: .6, style: { fontSize: 72, color: '#ffffff' } }] } } });
    expect(response.ok(), await response.text()).toBeTruthy(); rows.push(await response.json());
  }
  await page.goto(`/cut-studio?project=${project.id}`);
  const studio = page.getByLabel('CutStudio creative runtime');
  const first = studio.getByLabel('Composition First composition', { exact: true });
  const second = studio.getByLabel('Composition Second composition', { exact: true });
  await expect(first.getByLabel('Layer content', { exact: true })).toHaveValue('First composition');
  return { project, rows, studio, first, second };
}

test('creative drafts survive another save, unrelated refresh and blocked navigation', async ({ page }, info) => {
  const { project, rows, studio, first, second } = await setup(page, info);
  await first.getByLabel('Layer content', { exact: true }).fill('First unsaved');
  await second.getByLabel('Layer content', { exact: true }).fill('Second unsaved');
  await expect(first.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await studio.getByRole('button', { name: 'Flows', exact: true }).click();
  await studio.getByRole('button', { name: 'Starter campaign flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await studio.getByLabel('Workflow description', { exact: true }).fill('Preserve this workflow draft');
  await studio.getByRole('button', { name: 'Cinema', exact: true }).click();
  await studio.getByLabel('Objective', { exact: true }).fill('Preserve my production brief');
  await studio.getByRole('button', { name: 'Motion', exact: true }).click();
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/compositions/${rows[0].id}`));
  await first.getByRole('button', { name: 'Save composition', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(first.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await expect(second.getByLabel('Layer content', { exact: true })).toHaveValue('Second unsaved');
  await studio.getByRole('button', { name: 'Flows', exact: true }).click();
  await expect(studio.getByLabel('Workflow description', { exact: true })).toHaveValue('Preserve this workflow draft');
  await studio.getByRole('button', { name: 'Save graph', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Save graph', exact: true })).toBeEnabled();
  await studio.getByRole('button', { name: 'Motion', exact: true }).click();
  await studio.getByRole('button', { name: 'Kinetic', exact: true }).click();
  await expect(studio.getByLabel('Composition Creative draft custody · kinetic', { exact: true })).toBeVisible();
  await expect(second.getByLabel('Layer content', { exact: true })).toHaveValue('Second unsaved');
  await studio.getByRole('button', { name: 'Cinema', exact: true }).click();
  await expect(studio.getByLabel('Objective', { exact: true })).toHaveValue('Preserve my production brief');
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('Leave without saving'); await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`project=${project.id}`));
  await expect(studio.getByLabel('Objective', { exact: true })).toHaveValue('Preserve my production brief');
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('Discard all unsaved creative'); await dialog.dismiss(); });
  await studio.getByRole('button', { name: 'Discard creative edits', exact: true }).click();
  await expect(studio.getByLabel('Objective', { exact: true })).toHaveValue('Preserve my production brief');
  page.once('dialog', async (dialog) => { await dialog.accept(); });
  await studio.getByRole('button', { name: 'Discard creative edits', exact: true }).click();
  await expect(studio.getByLabel('Unsaved creative edits')).toHaveCount(0);
  await expect(studio.getByLabel('Objective', { exact: true })).toHaveValue('');
  await studio.getByRole('button', { name: 'Motion', exact: true }).click();
  await expect(first.getByLabel('Layer content', { exact: true })).toHaveValue('First unsaved');
  await expect(second.getByLabel('Layer content', { exact: true })).toHaveValue('Second composition');
});

test('creative save acknowledgement preserves an undo made while the response is pending', async ({ page }, info) => {
  const { project, rows, first, studio } = await setup(page, info);
  const content = first.getByLabel('Layer content', { exact: true });
  await content.fill('Submitted value');
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let committed = false;
  const revisions: string[] = [];
  await page.route(`**/projects/${project.id}/compositions/${rows[0].id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    revisions.push(route.request().headers()['if-match']);
    const response = await route.fetch();
    if (revisions.length === 1) { committed = true; await gate; }
    await route.fulfill({ response });
  });
  try {
    await first.getByRole('button', { name: 'Save composition', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await content.fill('First composition');
    release();
    await expect(first.getByRole('button', { name: 'Save composition', exact: true })).toBeEnabled();
    await expect(content).toHaveValue('First composition');
    await expect(studio.getByLabel('Unsaved creative edits')).toBeVisible();
    await expect(first.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await first.getByRole('button', { name: 'Save composition', exact: true }).click();
    await expect(first.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    expect(revisions).toEqual(['1', '2']);
    await page.reload();
    await expect(content).toHaveValue('First composition');
  } finally { release(); }
});

test('creative refresh never silently rebases a draft over another editor revision', async ({ page }, info) => {
  const { project, rows, studio, first } = await setup(page, info);
  await first.getByLabel('Layer content', { exact: true }).fill('Local revision');
  const remote = { ...rows[0], manifest: { ...rows[0].manifest, layers: rows[0].manifest.layers.map((layer: any) => ({ ...layer, text: 'Remote revision' })) } };
  const changed = await page.request.put(`/api/cut/projects/${project.id}/compositions/${rows[0].id}`, { headers: { 'If-Match': '1' }, data: remote });
  expect(changed.ok()).toBeTruthy();
  await studio.getByRole('button', { name: 'Kinetic', exact: true }).click();
  await expect(studio.getByLabel('Unsaved creative edits')).toContainText('changed elsewhere');
  await expect(first.getByLabel('Layer content', { exact: true })).toHaveValue('Local revision');
  await first.getByLabel('Layer content', { exact: true }).fill('First composition');
  await expect(studio.getByLabel('Unsaved creative edits')).toContainText('changed elsewhere');
  await expect(first.getByLabel('Layer content', { exact: true })).toHaveValue('First composition');
  await first.getByLabel('Layer content', { exact: true }).fill('Local revision');
  const conflict = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/compositions/${rows[0].id}`));
  await first.getByRole('button', { name: 'Save composition', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(first.getByLabel('Layer content', { exact: true })).toHaveValue('Local revision');
  const current = await (await page.request.get(`/api/cut/projects/${project.id}/creative-runtime`)).json();
  expect(current.compositions.find((row: any) => row.id === rows[0].id).manifest.layers[0].text).toBe('Remote revision');
  page.once('dialog', async (dialog) => { await dialog.accept(); });
  await studio.getByRole('button', { name: 'Discard creative edits', exact: true }).click();
  await expect(first.getByLabel('Layer content', { exact: true })).toHaveValue('Remote revision');
});

test('creative brief creation preserves newer edits until its own revision is saved', async ({ page }, info) => {
  const { project, studio } = await setup(page, info);
  await studio.getByRole('button', { name: 'Cinema', exact: true }).click();
  const objective = studio.getByLabel('Objective', { exact: true });
  await objective.fill('Submitted brief');
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let committed = false;
  const revisions: Array<string | undefined> = [];
  await page.route(`**/projects/${project.id}/production-brief`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    revisions.push(route.request().headers()['if-match']);
    const response = await route.fetch();
    if (revisions.length === 1) { committed = true; await gate; }
    await route.fulfill({ response });
  });
  try {
    await studio.getByRole('button', { name: 'Save brief', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await objective.fill('Newer brief');
    release();
    await expect(studio.getByRole('button', { name: 'Save brief', exact: true })).toBeEnabled();
    await expect(objective).toHaveValue('Newer brief');
    await expect(studio.getByLabel('Unsaved creative edits')).toBeVisible();
    await studio.getByRole('button', { name: 'Save brief', exact: true }).click();
    await expect(studio.getByLabel('Unsaved creative edits')).toHaveCount(0);
    expect(revisions).toEqual([undefined, '1']);
    await page.reload();
    await studio.getByRole('button', { name: 'Cinema', exact: true }).click();
    await expect(objective).toHaveValue('Newer brief');
  } finally { release(); }
});
