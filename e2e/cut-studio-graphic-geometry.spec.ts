import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { waitForCutRender } from './helpers/cut-render';

test('authored graphic pivots, animated scale and off-frame clipping match native frames', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const directory = info.outputPath('graphic-geometry'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=480x270:r=30:d=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(upload.ok()).toBeTruthy(); const source = (await upload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Graphic geometry proof', duration: 1, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const manifest = { version: 1, name: 'Authored geometry', width: 480, height: 270, fps: 30, durationInFrames: 30, layers: [
    { id: 'video', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 30 },
    { id: 'clipped', name: 'Clipped half path', kind: 'path', text: 'M0 0H50V100H0Z', from: 0, durationInFrames: 30, x: .8, y: .05, width: .4, height: .2, style: { fill: '#ff0000', stroke: '#ff0000', strokeWidth: 1 } },
    { id: 'pivot', name: 'Corner pivot', kind: 'shape', from: 0, durationInFrames: 30, x: .5, y: .52, width: .25, height: .2, anchorX: 0, anchorY: 0, style: { fill: '#00ff00' }, animations: [{ property: 'rotation', keyframes: [{ frame: 0, value: 0 }, { frame: 29, value: 90 }] }] },
    { id: 'scale', name: 'Top-right scale', kind: 'shape', from: 0, durationInFrames: 30, x: .2, y: .35, width: .15, height: .1, anchorX: 1, anchorY: 0, style: { fill: '#ffff00' }, animations: [{ property: 'scale', keyframes: [{ frame: 0, value: .5 }, { frame: 29, value: 1.5 }] }] },
  ] };
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Authored geometry', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const composition = await composed.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel('CutStudio creative runtime').getByLabel('CutStudio composition player');
  const previews = new Map<number, Buffer>();
  for (const frame of [0, 10, 20, 29]) {
    await player.getByLabel('Preview frame', { exact: true }).fill(String(frame));
    await expect(player).toHaveAttribute('data-player-state', 'paused');
    previews.set(frame, await player.getByLabel('Composition canvas', { exact: true }).screenshot({ path: `${directory}/preview-${frame}.png` }));
  }
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { 'If-Match': String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  const rendered = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', resolution: '720p', fps: 30, captions: false, quality: 'draft' } });
  expect(rendered.ok()).toBeTruthy(); const job = await rendered.json();
  await waitForCutRender(page.request, job.id, info);
  expect(await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).toMatchObject({ state: 'done' });
  const receipts: unknown[] = [];
  for (const [frame, preview] of previews) {
    const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=${frame}`); expect(still.ok()).toBeTruthy();
    const output = await still.body(); writeFileSync(`${directory}/export-${frame}.png`, output);
    const left = await sharp(preview).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const right = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (image: typeof left, x: number, y: number) => { const offset = (y * image.info.width + x) * 3; return Array.from(image.data.subarray(offset, offset + 3)); };
    const edgeProof = pixel(left, Math.floor(.95 * left.info.width), Math.floor(.15 * left.info.height));
    expect(edgeProof[0]).toBeGreaterThan(245); expect(edgeProof[1]).toBeLessThan(5);
    let compared = 0; let foreground = 0;
    for (let row = 1; row < 27; row++) for (let column = 1; column < 48; column++) {
      const x = Math.floor(column / 48 * left.info.width); const y = Math.floor(row / 27 * left.info.height);
      const expected = pixel(left, x, y);
      // Different delivery sizes/rasterizers can antialias boundary pixels
      // differently. Compare solid interiors, never discard a mismatch there.
      if ([-2, -1, 0, 1, 2].some((dy) => [-2, -1, 0, 1, 2].some((dx) => pixel(left, x + dx, y + dy).some((value, channel) => Math.abs(value - expected[channel]) > 5)))) continue;
      const actual = pixel(right, Math.floor(column / 48 * right.info.width), Math.floor(row / 27 * right.info.height));
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(actual[channel] - expected[channel]), `frame ${frame} at ${column}/48,${row}/27 channel ${channel}`).toBeLessThanOrEqual(8);
      compared++; if (expected[0] > 100 || expected[1] > 100) foreground++;
    }
    expect(compared).toBeGreaterThan(800); expect(foreground).toBeGreaterThan(50);
    receipts.push({ frame, compared, foreground });
  }
  writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipts, null, 2));
  expect(errors).toEqual([]);
});
