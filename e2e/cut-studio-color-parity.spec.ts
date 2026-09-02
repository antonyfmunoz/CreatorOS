import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { cutGraphicColorFilters } from '../server/cut-graphic-color';
import { evaluateCompositionFrame } from '../shared/cut-studio-production';
import { waitForCutRender } from './helpers/cut-render';

function colorOracle(rgb: number[], brightness: number, saturation: number, contrast = 1) {
  const [r, g, b] = rgb.map((channel) => Math.min(255, Math.max(0, Math.min(255, Math.max(0, (channel - 127.5) * contrast + 127.5)) * brightness)));
  return [
    (.213 + .787 * saturation) * r + (.715 - .715 * saturation) * g + (.072 - .072 * saturation) * b,
    (.213 - .213 * saturation) * r + (.715 + .285 * saturation) * g + (.072 - .072 * saturation) * b,
    (.213 - .213 * saturation) * r + (.715 - .715 * saturation) * g + (.072 + .928 * saturation) * b,
  ].map((channel) => Math.round(Math.min(255, Math.max(0, channel))));
}

test('native RGB color controls match CSS channel equations and preserve every alpha value', async ({}, info) => {
  const width = 16, height = 16, frames = 6, frameBytes = width * height * 4;
  const input = Buffer.alloc(frameBytes * frames);
  for (let frame = 0; frame < frames; frame++) for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = frame * frameBytes + pixel * 4;
    input.set([pixel, (pixel * 3) % 256, (pixel * 7) % 256, pixel], offset);
  }
  const receipts: unknown[] = [];
  const controls: Array<[string, string, number?]> = [['0', '1'], ['0.5', '1'], ['1', '1'], ['1.5', '1'], ['4', '1'], ['1', '0'], ['1', '0.5'], ['1', '2'], ['1', '4'], ['1.5', '0.5'], ['.9', '.7'], ['0.5+T', '1'], ['0.5+T', '2*T'],
    ['1', '1', 0], ['1', '1', .5], ['1', '1', 2], ['.8', '.7', 2], ['1.5', '.5', .5], ['.9', '4', 1.5], ['0.5+T', '2*T', .5], ['.25', '8', 8], ['8', '1', 8]];
  for (const [brightness, saturation, contrast = 1] of controls) {
    const output = execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', '6', '-i', 'pipe:0',
      '-vf', ['settb=AVTB', ...cutGraphicColorFilters(brightness, saturation, 'graphiccolor', contrast)].join(','), '-frames:v', String(frames), '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'],
    { input, windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    expect(output.length).toBe(input.length);
    let maximumColorError = 0, maximumAlphaError = 0;
    for (let frame = 0; frame < frames; frame++) for (let pixel = 0; pixel < width * height; pixel++) {
      const offset = frame * frameBytes + pixel * 4;
      const expected = colorOracle([...input.subarray(offset, offset + 3)], brightness === '0.5+T' ? .5 + frame / 6 : Number(brightness), saturation === '2*T' ? frame / 3 : Number(saturation), contrast);
      for (let channel = 0; channel < 3; channel++) maximumColorError = Math.max(maximumColorError, Math.abs(output[offset + channel] - expected[channel]));
      maximumAlphaError = Math.max(maximumAlphaError, Math.abs(output[offset + 3] - input[offset + 3]));
    }
    expect(maximumColorError, `${brightness}/${saturation}/${contrast} RGB`).toBeLessThanOrEqual(1);
    expect(maximumAlphaError, `${brightness}/${saturation}/${contrast} alpha`).toBe(0);
    receipts.push({ brightness, saturation, contrast, frames, comparedBytes: input.length, maximumColorError, maximumAlphaError });
  }
  writeFileSync(info.outputPath('rgb-channel-receipts.json'), JSON.stringify(receipts, null, 2));
});

for (const workload of ['base', 'effects'] as const) test(workload === 'base'
  ? 'saved graphic colors match the actual preview and downloaded native export'
  : 'ordered color effects match the actual preview and downloaded native export', async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath('color-parity'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=480x270:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(upload.ok()).toBeTruthy(); const source = (await upload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Color parity proof', duration: 2, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const controls = [[.5, 1], [1.5, 1], [1, 0], [1, 2], [1.5, .5], [.5, 2], [1, 1], [1, 1]];
  // Hold the source/base controls equal: these two cards differ ONLY in order.
  if (workload === 'effects') controls[3] = controls[4] = [.7, 1];
  const contrastFirst = [{ contrast: 1.7, brightness: 1, saturation: 1 }, { contrast: 1, brightness: .5, saturation: 1 }];
  const effectParameters = [[{ contrast: 0 }], [{ contrast: 2 }], [{ contrast: 1.5, brightness: .8, saturation: .7 }],
    contrastFirst, [...contrastFirst].reverse(), [{ amount: .8, brightness: 1.5 }], [{ contrast: .8, brightness: 1.5, saturation: .5 }], [{ contrast: 1.5, brightness: .6, saturation: .4 }]];
  const cards = controls.map(([brightness, saturation], index) => ({ id: `card${index}`, name: `Card ${index}`, kind: 'shape', from: 0, durationInFrames: 60,
    x: .1 + (index % 2) * .45, y: .05 + Math.floor(index / 2) * .23, width: .2, height: .15,
    opacity: index === 6 ? .5 : 1, style: { fill: '#4080c0' },
    effects: workload === 'effects' ? [
      ...effectParameters[index].map((parameters, effectIndex) => ({ id: `color${index}effect${effectIndex}`, kind: 'color_matrix', enabled: true, parameters })),
      { id: `disabled${index}`, kind: 'color_matrix', enabled: false, parameters: { brightness: 0 } },
    ] : [],
    animations: index === 7 ? [
      { property: 'brightness', keyframes: [{ frame: 0, value: .5, easing: 'linear' }, { frame: 59, value: 1.5, easing: 'ease_in_out' }] },
      { property: 'saturation', keyframes: [{ frame: 0, value: 0, easing: 'linear' }, { frame: 59, value: 2, easing: 'spring' }] },
    ] : [
      { property: 'brightness', keyframes: [{ frame: 0, value: brightness, easing: 'linear' }] },
      { property: 'saturation', keyframes: [{ frame: 0, value: saturation, easing: 'linear' }] },
    ],
  }));
  const manifest = { version: 1, name: 'RGB proof', width: 1920, height: 1080, fps: 30, durationInFrames: 60,
    layers: [{ id: 'source', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 60 }, ...cards] };
  if (workload === 'effects') {
    const unsupported = { ...manifest, layers: [manifest.layers[0], { ...cards[0], effects: [{ id: 'unsupported', kind: 'color_matrix', parameters: { brightness: 9 } }] }] };
    const savedUnsupported = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Unsupported native effect', manifest: unsupported } });
    expect(savedUnsupported.ok()).toBeTruthy();
    const failedApply = await page.request.post(`/api/cut/projects/${project.id}/compositions/${(await savedUnsupported.json()).id}/apply`, { headers: { 'If-Match': String(project.revision) } });
    expect(failedApply.status()).toBe(400);
    expect((await failedApply.json()).message).toContain('cannot exceed eight');
    const unchanged = await page.request.get(`/api/cut/projects/${project.id}`); expect(unchanged.ok()).toBeTruthy();
    expect((await unchanged.json()).revision).toBe(project.revision);
  }
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'RGB proof', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const saved = await composed.json();
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${saved.id}/apply`, { headers: { 'If-Match': String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  const submitted = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', resolution: '720p', fps: 30, captions: false, quality: 'draft' } });
  expect(submitted.ok(), await submitted.text()).toBeTruthy(); const job = await submitted.json();
  await page.goto(`/cut-studio?project=${project.id}`);
  const player = page.getByLabel('CutStudio creative runtime').getByLabel('Composition RGB proof', { exact: true }).getByLabel('CutStudio composition player');
  const previews = new Map<number, Buffer>();
  for (const frame of [0, 14, 44, 59]) {
    await player.getByLabel('Preview frame', { exact: true }).fill(String(frame));
    await expect(player).toHaveAttribute('data-current-frame', String(frame));
    await expect(player).toHaveAttribute('data-player-state', 'paused');
    previews.set(frame, await player.getByLabel('Composition canvas', { exact: true }).screenshot({ path: `${directory}/preview-${frame}.png` }));
  }
  await waitForCutRender(page.request, job.id, info);
  const completed = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json(); expect(completed, completed.detail).toMatchObject({ state: 'done' });
  const media = await page.request.get(`/api/cut/jobs/${job.id}/media-file`); expect(media.ok()).toBeTruthy();
  const exportPath = `${directory}/render.mp4`; writeFileSync(exportPath, await media.body());
  const receipts: unknown[] = [];
  for (const [frame, preview] of previews) {
    const output = execFileSync('ffmpeg', ['-v', 'error', '-i', exportPath, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { windowsHide: true, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    writeFileSync(`${directory}/export-${frame}.png`, output);
    const images = await Promise.all([preview, output].map((bytes) => sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
    const states = evaluateCompositionFrame(manifest, frame);
    const frameSamples = new Map<string, number[][]>();
    for (const card of cards) {
      const colors = images.map((image) => {
        const offset = (Math.floor((card.y + .075) * image.info.height) * image.info.width + Math.floor((card.x + .1) * image.info.width)) * 3;
        return [...image.data.subarray(offset, offset + 3)];
      });
      const error = Math.max(...colors[0].map((channel, index) => Math.abs(channel - colors[1][index])));
      frameSamples.set(card.id, colors);
      const state = states.find((layer) => layer.id === card.id)!;
      let expected = colorOracle([64, 128, 192], state.brightness, state.saturation);
      if (workload === 'effects') for (const parameters of effectParameters[cards.indexOf(card)]) {
        const values = parameters as Record<string, number>;
        expected = colorOracle(expected, values.brightness ?? values.amount ?? 1, values.saturation ?? values.amount ?? 1, values.contrast ?? values.amount ?? 1);
      }
      expected = expected.map((channel) => Math.round(channel * state.opacity));
      expect(Math.max(...colors[0].map((channel, index) => Math.abs(channel - expected[index]))), `${card.id} preview implements authored controls at ${frame}`).toBeLessThanOrEqual(2);
      expect(error, `${card.id} preview/export RGB at frame ${frame}: ${JSON.stringify(colors)}`).toBeLessThanOrEqual(4);
      receipts.push({ frame, card: card.id, preview: colors[0], native: colors[1], maximumChannelError: error });
    }
    if (workload === 'effects') for (const outputIndex of [0, 1]) {
      const first = frameSamples.get('card3')![outputIndex], reversed = frameSamples.get('card4')![outputIndex];
      expect(Math.max(...first.map((channel, index) => Math.abs(channel - reversed[index]))), 'reversing effects on identical input changes both preview and export').toBeGreaterThan(10);
    }
  }
  writeFileSync(`${directory}/colors.json`, JSON.stringify(receipts, null, 2));
});
