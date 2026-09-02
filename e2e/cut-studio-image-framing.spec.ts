import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { waitForCutRender } from './helpers/cut-render';

test('image framing controls preserve crop, transparent fit and stretch in actual export', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const directory = info.outputPath('image-framing'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=480x270:r=30:d=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(upload.ok()).toBeTruthy(); const source = (await upload.json()).asset;
  const pixels = Buffer.alloc(400 * 100 * 4);
  const colors = [[255, 0, 0, 255], [0, 255, 0, 255], [255, 255, 255, 0], [255, 255, 0, 128]];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 400; x++) for (let c = 0; c < 4; c++) pixels[(y * 400 + x) * 4 + c] = colors[Math.floor(x / 100)][c];
  const imageBytes = await sharp(pixels, { raw: { width: 400, height: 100, channels: 4 } }).png().toBuffer();
  const imageUpload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'photo', visibility: 'private', image: { name: 'wide-rgba.png', mimeType: 'image/png', buffer: imageBytes } } });
  expect(imageUpload.ok()).toBeTruthy(); const image = (await imageUpload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Image framing proof', duration: 1, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  expect((await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: image.id, name: 'Wide RGBA', duration: 1, mediaKind: 'image' } })).ok()).toBeTruthy();
  const fits = ['cover', 'contain', 'fill']; const origins = [.05, .375, .7];
  const manifest = { version: 1, name: 'Image framing', width: 480, height: 270, fps: 30, durationInFrames: 30, layers: [
    { id: 'video', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 30 },
    ...fits.map((fit, index) => ({ id: fit, name: fit, kind: 'image', assetId: image.id, from: 0, durationInFrames: 30, x: origins[index], y: .1, width: .25, height: 120 / 270, style: index ? { objectFit: fit } : {} })),
  ] };
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Image framing', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const composition = await composed.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const studio = page.getByLabel('CutStudio creative runtime'); const player = studio.getByLabel('CutStudio composition player');
  await expect(player).toHaveAttribute('data-player-state', 'paused');
  await studio.getByLabel('Selected layer', { exact: true }).selectOption('cover');
  const framing = studio.getByLabel('Image framing', { exact: true });
  await expect(framing).toHaveValue('cover');
  await framing.selectOption('contain');
  await expect(player.getByRole('img', { name: 'cover', exact: true })).toHaveCSS('object-fit', 'contain');
  await expect(studio.getByLabel('Unsaved creative edits')).toBeVisible();
  const saveFit = async (fit: string) => {
    const saving = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/compositions/${composition.id}`));
    await studio.getByRole('button', { name: 'Save composition', exact: true }).click();
    const response = await saving; expect(response.ok()).toBeTruthy();
    const saved = await response.json();
    expect(saved.manifest.layers.find((layer: { id: string }) => layer.id === 'cover').style.objectFit).toBe(fit);
    await expect(studio.getByLabel('Unsaved creative edits')).toHaveCount(0);
  };
  await saveFit('contain');
  await framing.selectOption('cover');
  await expect(player.getByRole('img', { name: 'cover', exact: true })).toHaveCSS('object-fit', 'cover');
  await saveFit('cover');
  await player.getByLabel('Preview frame', { exact: true }).fill('6');
  await expect(player).toHaveAttribute('data-player-state', 'paused');
  const preview = await player.getByLabel('Composition canvas', { exact: true }).screenshot({ path: `${directory}/preview.png` });
  await info.attach('image-framing-preview', { body: preview, contentType: 'image/png' });
  const points = [
    { layer: 0, x: .25, y: .5, rgb: [0, 255, 0] }, { layer: 0, x: .75, y: .5, rgb: [0, 0, 255] },
    { layer: 1, x: .125, y: .1, rgb: [0, 0, 255] }, { layer: 1, x: .875, y: .9, rgb: [0, 0, 255] },
    ...[1, 2].flatMap((layer) => [
      { layer, x: .125, y: .5, rgb: [255, 0, 0] }, { layer, x: .375, y: .5, rgb: [0, 255, 0] },
      { layer, x: .625, y: .5, rgb: [0, 0, 255] }, { layer, x: .875, y: .5, rgb: [128, 128, 127] },
    ]),
    { layer: 2, x: .125, y: .1, rgb: [255, 0, 0] }, { layer: 2, x: .875, y: .9, rgb: [128, 128, 127] },
  ];
  async function samples(buffer: Buffer) {
    const { data, info: image } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return points.map((point) => {
      const x = Math.floor((origins[point.layer] + .25 * point.x) * image.width);
      const y = Math.floor((.1 + 120 / 270 * point.y) * image.height);
      const offset = (y * image.width + x) * 3; return Array.from(data.subarray(offset, offset + 3));
    });
  }
  const previewSamples = await samples(preview);
  for (let p = 0; p < points.length; p++) for (let c = 0; c < 3; c++) expect(Math.abs(previewSamples[p][c] - points[p].rgb[c]), `preview sample ${p}, channel ${c}`).toBeLessThanOrEqual(5);
  expect((await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { 'If-Match': String(project.revision) } })).ok()).toBeTruthy();
  const rendered = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', resolution: '720p', fps: 30, captions: false, quality: 'draft' } });
  expect(rendered.ok()).toBeTruthy(); const job = await rendered.json();
  await waitForCutRender(page.request, job.id, info);
  expect(await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).toMatchObject({ state: 'done' });
  const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=6`); expect(still.ok()).toBeTruthy();
  const exportBytes = await still.body(); writeFileSync(`${directory}/export.png`, exportBytes);
  await info.attach('image-framing-export', { body: exportBytes, contentType: 'image/png' });
  const exported = await samples(exportBytes);
  for (let p = 0; p < points.length; p++) for (let c = 0; c < 3; c++) expect(Math.abs(exported[p][c] - previewSamples[p][c]), `export sample ${p}, channel ${c}`).toBeLessThanOrEqual(6);
  expect(errors).toEqual([]);
});
