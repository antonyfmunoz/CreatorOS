import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { waitForCutRender } from './helpers/cut-render';

for (const transition of [false, true]) {
  test(`private ${transition ? 'transition' : 'static'} mask preserves transparency in preview and exported video`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    const directory = info.outputPath('private-mask'); mkdirSync(directory, { recursive: true });
    const sourcePath = `${directory}/source.mp4`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
    const upload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
    expect(upload.ok()).toBeTruthy(); const source = (await upload.json()).asset;
    const pixels = Buffer.alloc(400 * 200 * 4);
    const maskBands = [[0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 128], [255, 255, 255, 0], [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [128, 128, 128, 255]];
    for (let y = 0; y < 200; y++) for (let x = 0; x < 400; x++) {
      const offset = (y * 400 + x) * 4; const band = maskBands[Math.floor(x / 50)];
      for (let channel = 0; channel < 4; channel++) pixels[offset + channel] = band[channel];
    }
    const maskBytes = await sharp(pixels, { raw: { width: 400, height: 200, channels: 4 } }).png().toBuffer();
    const maskUpload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'photo', visibility: 'private', image: { name: 'rgba-mask.png', mimeType: 'image/png', buffer: maskBytes } } });
    expect(maskUpload.ok()).toBeTruthy(); const mask = (await maskUpload.json()).asset;
    const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Private mask proof', duration: 1, mediaKind: 'video' } });
    expect(created.ok()).toBeTruthy(); const project = await created.json();
    expect((await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: mask.id, name: 'RGBA mask', duration: 1, mediaKind: 'image' } })).ok()).toBeTruthy();
    const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Transparent mask', manifest: { version: 1, name: 'Transparent mask', width: 480, height: 270, fps: 30, durationInFrames: 30,
      layers: [
        { id: 'video', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 30 },
        { id: 'masked', name: 'Masked green', kind: 'shape', from: 0, durationInFrames: 30, x: .1, y: .1, width: .8, height: .8, style: { fill: '#00ff00' }, ...(transition ? { enter: { kind: 'custom_mask', durationInFrames: 12, easing: 'linear', maskAssetId: mask.id } } : { effects: [{ id: 'mask', kind: 'mask', parameters: { maskAssetId: mask.id } }] }) },
      ],
    } } });
    expect(composed.ok(), await composed.text()).toBeTruthy(); const composition = await composed.json();
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const pattern = `**/api/assets/${mask.id}/stream*`;
    await page.route(pattern, async (route) => { await gate; await route.continue(); });
    const player = page.getByLabel('CutStudio creative runtime').getByLabel('CutStudio composition player');
    try {
      await page.goto(`/cut-studio?project=${project.id}`, { waitUntil: 'domcontentloaded' });
      await expect(player).toHaveAttribute('data-player-state', 'buffering');
      await player.getByRole('button', { name: 'Play composition', exact: true }).click();
      const held = await player.evaluate((element) => new Promise<number[]>((resolve) => {
        const frames: number[] = []; const start = performance.now(); const tick = () => { frames.push(Number(element.getAttribute('data-current-frame'))); if (performance.now() - start > 300) resolve(frames); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      }));
      expect(new Set(held).size).toBe(1);
      await player.getByRole('button', { name: 'Pause composition', exact: true }).click();
      release(); await expect(player).toHaveAttribute('data-player-state', 'paused');
      await expect(player.locator('[data-private-mask="ready"]')).toBeVisible();
    } finally { release(); await page.unroute(pattern); }

    if (!transition) {
      let fail = true;
      await page.route(pattern, (route) => fail ? route.fulfill({ status: 503, body: 'Synthetic unavailable private mask' }) : route.continue());
      try {
        await page.reload(); await expect(player).toHaveAttribute('data-player-state', 'error');
        await expect(player.getByText('The private layer mask is unavailable.', { exact: true })).toBeVisible();
        fail = false; await player.getByRole('button', { name: 'Retry preview', exact: true }).click();
        await expect(player).toHaveAttribute('data-player-state', 'paused');
        await expect(player.locator('[data-private-mask="ready"]')).toBeVisible();
      } finally { await page.unroute(pattern); }
    }

    const samples = async (buffer: Buffer) => {
      const { data, info: image } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return Array.from({ length: 8 }, (_, index) => (index + .5) / 8).map((position) => {
        const x = Math.floor((.1 + .8 * position) * image.width); const y = Math.floor(image.height / 2); const offset = (y * image.width + x) * 3;
        return Array.from(data.subarray(offset, offset + 3));
      });
    };
    const previewSamples = new Map<number, number[][]>();
    for (const frame of transition ? [6, 18] : [6]) {
      await player.getByLabel('Preview frame', { exact: true }).fill(String(frame));
      await expect(player).toHaveAttribute('data-player-state', 'paused');
      const screenshot = await player.getByLabel('Composition canvas', { exact: true }).screenshot({ path: `${directory}/preview-${frame}.png` });
      await info.attach(`mask-preview-${frame}`, { body: screenshot, contentType: 'image/png' });
      const sample = await samples(screenshot); previewSamples.set(frame, sample);
      const opacity = transition && frame === 6 ? .5 : 1;
      const expected = [0, 255, 128, 0, 54, 182, 18, 128].map((alpha) => [0, alpha * opacity, 255 - alpha * opacity]);
      for (let band = 0; band < 8; band++) for (let channel = 0; channel < 3; channel++) expect(Math.abs(sample[band][channel] - expected[band][channel])).toBeLessThanOrEqual(5);
    }
    const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { 'If-Match': String(project.revision) } });
    expect(applied.ok(), await applied.text()).toBeTruthy();
    const rendered = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', resolution: '720p', fps: 30, captions: false, quality: 'draft' } });
    expect(rendered.ok()).toBeTruthy(); const job = await rendered.json();
    await waitForCutRender(page.request, job.id, info);
    expect(await (await page.request.get(`/api/cut/jobs/${job.id}`)).json()).toMatchObject({ state: 'done' });
    for (const [frame, preview] of Array.from(previewSamples)) {
      const still = await page.request.get(`/api/cut/jobs/${job.id}/still?frame=${frame}`); expect(still.ok()).toBeTruthy();
      const buffer = await still.body(); const encoded = await samples(buffer);
      writeFileSync(`${directory}/export-${frame}.png`, buffer);
      await info.attach(`mask-export-${frame}`, { body: buffer, contentType: 'image/png' });
      for (let band = 0; band < 8; band++) for (let channel = 0; channel < 3; channel++) expect(Math.abs(encoded[band][channel] - preview[band][channel])).toBeLessThanOrEqual(6);
    }
    const peer = info.project.name.startsWith('mobile') ? 2 : 1;
    expect((await page.request.get(`/api/assets/${mask.id}/stream`, { headers: { 'x-creativesos-demo-user': String(peer) } })).status()).toBe(403);
    expect(errors).toEqual([]);
  });
}
