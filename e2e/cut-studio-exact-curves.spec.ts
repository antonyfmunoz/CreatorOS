import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { compileCompositionToEdl, evaluateCompositionFrame } from '../shared/cut-studio-production';
import { cutGraphicCurveExpression } from '../server/cut-curve-expression';
import { waitForCutRender } from './helpers/cut-render';

const easings = ['linear', 'ease_in', 'ease_out', 'ease_in_out', 'spring', 'step'] as const;
const composition = (assetId: string) => ({ version: 1, name: 'Exact authored curves', width: 1920, height: 1080, fps: 30, durationInFrames: 90, layers: [
  { id: 'source', name: 'Source', kind: 'video', assetId, from: 0, durationInFrames: 90 },
  ...easings.map((easing, index) => ({ id: easing, name: easing, kind: 'shape', from: 0, durationInFrames: 90, x: .08, y: .05 + index * .15, width: .04, height: .08, style: { fill: '#ff0000' },
    animations: [{ property: 'x', keyframes: [{ frame: 0, value: .08, easing }, { frame: 89, value: .75, easing }] }] })),
] });

test('native scalar formulas match every authored frame including spring and mismatched delivery rates', async ({}, info) => {
  const manifest = composition('11111111-1111-4111-8111-111111111111');
  const graphics = compileCompositionToEdl(manifest, { version: 3, clips: [] }).graphics!;
  const receipts: unknown[] = [];
  for (const microsecondTimeBase of [false, true]) for (const deliveryFps of [24, 30, 60]) for (const graphic of graphics) {
    const expression = cutGraphicCurveExpression(graphic.compositionCurves!, 'x', 0, 'T')!;
    const frames = deliveryFps * 3;
    const pixels = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=white:s=4x4:r=${deliveryFps}:d=3,format=rgba`,
      '-vf', `${microsecondTimeBase ? 'settb=AVTB,' : ''}geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*(${expression})'`, '-frames:v', String(frames), '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'],
    { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    expect(pixels.length).toBe(frames * 64);
    let maximumError = 0;
    for (let frame = 0; frame < frames; frame++) {
      const authoredFrame = Math.floor(frame * manifest.fps / deliveryFps + 1e-7);
      const expected = evaluateCompositionFrame(manifest, authoredFrame).find((layer) => layer.id === graphic.id)!.x;
      for (let pixel = 0; pixel < 16; pixel++) maximumError = Math.max(maximumError, Math.abs(pixels[frame * 64 + pixel * 4 + 3] - Math.floor(expected * 255)));
    }
    expect(maximumError, `${graphic.id} at ${deliveryFps} fps, AVTB=${microsecondTimeBase}`).toBeLessThanOrEqual(1);
    receipts.push({ easing: graphic.id, deliveryFps, microsecondTimeBase, frames, maximumAlphaQuantizationError: maximumError });
  }
  writeFileSync(info.outputPath('curve-formula-frames.json'), JSON.stringify(receipts, null, 2));
});

test('saved nonlinear compositions retain two-pixel preview and native position agreement', async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath('exact-curves'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=480x270:r=30:d=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(upload.ok()).toBeTruthy(); const source = (await upload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Exact curve proof', duration: 3, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const manifest = composition(source.id);
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Exact curves', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const saved = await composed.json();
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${saved.id}/apply`, { headers: { 'If-Match': String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  const submitted = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', resolution: '720p', fps: 30, captions: false, quality: 'draft' } });
  expect(submitted.ok()).toBeTruthy(); const job = await submitted.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel('CutStudio creative runtime').getByLabel('CutStudio composition player');
  const previews = new Map<number, Buffer>();
  for (const frame of [1, 4, 9, 14, 23, 44, 67, 88]) {
    await player.getByLabel('Preview frame', { exact: true }).fill(String(frame));
    await expect(player).toHaveAttribute('data-current-frame', String(frame));
    await expect(player).toHaveAttribute('data-player-state', 'paused');
    previews.set(frame, await player.getByLabel('Composition canvas', { exact: true }).screenshot({ path: `${directory}/preview-${frame}.png` }));
  }
  await waitForCutRender(page.request, job.id, info);
  const completed = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(completed, completed.detail).toMatchObject({ state: 'done' });
  // Decode the actual private export once locally. Eight frame comparisons are
  // not eight user still-export actions and must not consume that API's quota.
  const media = await page.request.get(`/api/cut/jobs/${job.id}/media-file`);
  expect(media.ok(), `Private export HTTP ${media.status()}`).toBeTruthy();
  const exportPath = `${directory}/render.mp4`; writeFileSync(exportPath, await media.body());
  const receipts: unknown[] = [];
  for (const [frame, preview] of previews) {
    const output = execFileSync('ffmpeg', ['-v', 'error', '-i', exportPath, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'],
      { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    writeFileSync(`${directory}/export-${frame}.png`, output);
    const expected = evaluateCompositionFrame(manifest, frame).filter((layer) => layer.kind === 'shape');
    for (const [kind, bytes] of [['preview', preview], ['native', output]] as const) {
      const image = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const state of expected) {
        const row = Math.floor((state.y + .04) * image.info.height);
        const xs: number[] = [];
        for (let x = 0; x < image.info.width; x++) {
          const offset = (row * image.info.width + x) * 3;
          if (image.data[offset] > 180 && image.data[offset + 1] < 60 && image.data[offset + 2] < 60) xs.push(x);
        }
        expect(xs.length, `${kind} ${state.id} foreground at ${frame}`).toBeGreaterThan(image.info.width * .025);
        const error = Math.abs(xs[0] - state.x * image.info.width);
        expect(error, `${kind} ${state.id} left edge at ${frame}`).toBeLessThanOrEqual(2);
        receipts.push({ kind, easing: state.id, frame, expectedX: state.x * image.info.width, actualX: xs[0], error });
      }
    }
  }
  writeFileSync(`${directory}/positions.json`, JSON.stringify(receipts, null, 2));
});
