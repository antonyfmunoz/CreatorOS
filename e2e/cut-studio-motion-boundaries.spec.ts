import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { evaluateCompositionFrame } from '../shared/cut-studio-production';
import { waitForCutRender } from './helpers/cut-render';

test('native motion retains twenty authored controls and held step frames', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const directory = info.outputPath('motion-boundaries'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=480x270:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(upload.ok()).toBeTruthy(); const source = (await upload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Motion boundaries proof', duration: 2, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const manifest = { version: 1, name: 'Motion boundaries', width: 480, height: 270, fps: 30, durationInFrames: 60, layers: [
    { id: 'video', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 60 },
    ...['step', 'linear'].map((easing, index) => ({ id: easing, name: easing, kind: 'shape', from: 0, durationInFrames: 60, x: .1, y: index ? .6 : .2, width: .08, height: .15, style: { fill: index ? '#00ff00' : '#ff0000' }, animations: [{ property: 'x', keyframes: Array.from({ length: 20 }, (_, i) => ({ frame: i * 3, value: i % 2 ? .7 : .1, easing })) }] })),
  ] };
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Motion boundaries', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const composition = await composed.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel('CutStudio creative runtime').getByLabel('CutStudio composition player');
  const previews = new Map<number, Buffer>();
  for (const frame of [2, 3, 7, 17, 29, 30, 56, 57]) {
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
    const states = evaluateCompositionFrame(manifest, frame).filter((state) => state.kind === 'shape');
    for (const [kind, bytes] of [['preview', preview], ['export', output]] as const) {
      const image = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const state of states) {
        const expected = state.id === 'step' ? [255, 0, 0] : [0, 255, 0];
        // Three separated interior points expose movement/size loss, not only
        // the existence of a colored pixel somewhere on the canvas.
        for (const fraction of [.25, .5, .75]) {
          const x = Math.floor((state.x + .08 * fraction) * image.info.width);
          const y = Math.floor((state.y + .075) * image.info.height);
          const offset = (y * image.info.width + x) * 3;
          for (let channel = 0; channel < 3; channel++) expect(Math.abs(image.data[offset + channel] - expected[channel]), `${kind} ${state.id} frame ${frame} interior ${fraction} channel ${channel}`).toBeLessThanOrEqual(8);
        }
      }
    }
    receipts.push({ frame, positions: states.map((state) => ({ id: state.id, x: state.x, y: state.y })) });
  }
  writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipts, null, 2));
  const before = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  const excessive = structuredClone(manifest);
  excessive.layers[1].animations![0].keyframes = Array.from({ length: 51 }, (_, frame) => ({ frame, value: frame % 2 ? .7 : .1, easing: 'linear' }));
  const excessiveResponse = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Unsupported boundaries', manifest: excessive } });
  expect(excessiveResponse.ok()).toBeTruthy(); const excessiveComposition = await excessiveResponse.json();
  const rejected = await page.request.post(`/api/cut/projects/${project.id}/compositions/${excessiveComposition.id}/apply`, { headers: { 'If-Match': String(before.revision) } });
  expect(rejected.status()).toBe(400); expect((await rejected.json()).message).toMatch(/50 motion boundary frames/);
  const after = await (await page.request.get(`/api/cut/projects/${project.id}`)).json();
  expect(after.revision).toBe(before.revision); expect(after.edl).toEqual(before.edl);
  expect(errors).toEqual([]);
});
