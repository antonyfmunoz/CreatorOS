import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { decodeCutRenderFrame, downloadCutRender, waitForCutRender } from './helpers/cut-render';

test('SVG and primitive framing leave transparent gutters over the source', async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath('vector-framing'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=480x270:r=30:d=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const uploaded = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(uploaded.ok()).toBeTruthy(); const source = (await uploaded.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Transparent vector framing', duration: 1, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const manifest = { version: 1, name: 'Vector framing', width: 480, height: 270, fps: 30, durationInFrames: 30, layers: [
    { id: 'source', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 30 },
    { id: 'vector', name: 'Wide vector', kind: 'svg', text: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#ff0000"/></svg>', from: 0, durationInFrames: 30, x: .1, y: .1, width: .3, height: .5 },
    { id: 'primitive', name: 'Green cube', kind: 'three', from: 0, durationInFrames: 30, x: .5, y: .2, width: .45, height: .2, style: { primitive: 'cube', color: '#00ff00', secondaryColor: '#00ff00', edgeColor: '#00ff00' } },
  ] };
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Vector framing', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const composition = await composed.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel('CutStudio creative runtime').getByLabel('CutStudio composition player');
  await expect(player).toHaveAttribute('data-player-state', 'paused');
  await player.locator('[data-layer-kind="svg"] img').evaluate((image: HTMLImageElement) => image.decode());
  await player.getByRole('img', { name: 'cube primitive' }).evaluate((image: HTMLImageElement) => image.decode());
  const preview = await player.getByLabel('Composition canvas', { exact: true }).screenshot({ path: `${directory}/preview.png` });
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { 'If-Match': String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  const rendered = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', resolution: '720p', fps: 30, quality: 'draft', captions: false } });
  expect(rendered.ok()).toBeTruthy(); const job = await rendered.json();
  await waitForCutRender(page.request, job.id, info);
  const completed = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(completed, completed.detail).toMatchObject({ state: 'done' });
  const exportPath = await downloadCutRender(page.request, job.id, `${directory}/render.mp4`);
  const output = decodeCutRenderFrame(exportPath, 6); writeFileSync(`${directory}/export.png`, output);
  const points = [
    { x: .25, y: .12, rgb: [0, 0, 255] }, { x: .25, y: .58, rgb: [0, 0, 255] },
    { x: .52, y: .3, rgb: [0, 0, 255] }, { x: .93, y: .3, rgb: [0, 0, 255] },
    { x: .25, y: .35, rgb: [255, 0, 0] }, { x: .725, y: .3, rgb: [0, 255, 0] },
  ];
  for (const [kind, bytes] of [['preview', preview], ['export', output]] as const) {
    const image = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const point of points) {
      const offset = (Math.floor(point.y * image.info.height) * image.info.width + Math.floor(point.x * image.info.width)) * 3;
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(image.data[offset + channel] - point.rgb[channel]), `${kind} at ${point.x},${point.y} channel ${channel}`).toBeLessThanOrEqual(6);
    }
  }
});
