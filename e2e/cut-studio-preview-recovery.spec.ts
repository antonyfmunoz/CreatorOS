import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';

for (const kind of ['video', 'image', 'audio'] as const) {
  test(`composition preview recovers when a failed ${kind} asset is replaced`, async ({ page }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const directory = info.outputPath('preview-recovery'); mkdirSync(directory, { recursive: true });
    if (kind === 'audio') await page.addInitScript(() => {
      // Observe real post-gain browser samples, without replacing playback or
      // synthesizing a success value. The application's graph stays connected.
      const original = AudioContext.prototype.createGain;
      const meters: AnalyserNode[] = [];
      (window as unknown as { cutPreviewMeters: AnalyserNode[] }).cutPreviewMeters = meters;
      AudioContext.prototype.createGain = function () {
        const gain = original.call(this); const meter = this.createAnalyser();
        meter.fftSize = 1024; gain.connect(meter); meters.push(meter); return gain;
      };
    });
    const file = `${directory}/source.mp4`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
    const uploadVideo = async () => {
      const response = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(file) } } });
      expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).asset;
    };
    const uploadImage = async () => {
      const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#00cc55' } }).png().toBuffer();
      const response = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'photo', visibility: 'private', image: { name: 'image.png', mimeType: 'image/png', buffer } } });
      expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).asset;
    };
    const uploadAudio = async () => {
      const audio = `${directory}/tone.wav`;
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=500:sample_rate=48000:duration=2', '-c:a', 'pcm_s16le', audio]);
      const response = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'audio', visibility: 'private', audio: { name: 'tone.wav', mimeType: 'audio/wav', buffer: readFileSync(audio) } } });
      expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).asset;
    };
    const source = await uploadVideo();
    const failed = kind === 'video' ? source : kind === 'audio' ? await uploadAudio() : await uploadImage();
    const replacement = kind === 'video' ? await uploadVideo() : kind === 'audio' ? await uploadAudio() : await uploadImage();
    let sourceRms = 0;
    if (kind === 'audio') {
      const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', `${directory}/tone.wav`, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
      expect(decoded.length).toBeGreaterThan(0);
      let energy = 0; for (let offset = 0; offset < decoded.length; offset += 4) energy += decoded.readFloatLE(offset) ** 2;
      sourceRms = Math.sqrt(energy / (decoded.length / 4));
      expect(sourceRms).toBeGreaterThan(.08); expect(sourceRms).toBeLessThan(.095);
    }
    const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Preview recovery', duration: 2, mediaKind: 'video' } });
    expect(created.ok()).toBeTruthy(); const project = await created.json();
    for (const asset of [failed, replacement]) {
      if (asset.id === source.id) continue;
      const added = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: asset.id, name: `${kind} ${asset.id}`, duration: 2, mediaKind: kind } });
      expect(added.ok(), await added.text()).toBeTruthy();
    }
    const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Recoverable layer', manifest: { version: 1, name: 'Recoverable layer', width: 480, height: 270, fps: 30, durationInFrames: 60, layers: [{ id: 'media', name: 'Private layer', kind, assetId: failed.id, from: 0, durationInFrames: 60, width: 1, height: 1 }] } } });
    expect(composed.ok(), await composed.text()).toBeTruthy();
    const failedPattern = `**/api/assets/${failed.id}/stream*`;
    await page.route(failedPattern, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic temporary storage failure"}' }));
    await page.goto(`/cut-studio?project=${project.id}`);
    const studio = page.getByLabel('CutStudio creative runtime');
    const player = studio.getByLabel('CutStudio composition player');
    const errorText = kind === 'image' ? 'This private image could not be displayed.' : 'This private media could not be played.';
    await expect(player.getByText(errorText, { exact: true })).toBeVisible();
    // Create the audio graph for the old element before replacement, so the
    // new media must attach cleanly without reusing or duplicating its source.
    if (kind !== 'image') await player.getByRole('button', { name: 'Unmute composition', exact: true }).click();
    await studio.getByLabel('Selected layer', { exact: true }).selectOption('media');
    await studio.getByLabel('Layer media asset', { exact: true }).selectOption(replacement.id);
    await expect(player.getByText(errorText, { exact: true })).toHaveCount(0);
    const media = kind === 'image' ? player.getByRole('img', { name: 'Private layer' }) : player.locator(`${kind}[data-composition-media="${kind}"]`);
    await expect(media).toHaveAttribute('src', `/api/assets/${replacement.id}/stream`);
    await expect.poll(() => media.evaluate((element) => element instanceof HTMLImageElement ? element.complete && element.naturalWidth > 0 : element instanceof HTMLMediaElement && element.readyState >= 2 && (!(element instanceof HTMLVideoElement) || element.videoWidth > 0))).toBe(true);
    if (kind !== 'image') {
      await player.getByRole('button', { name: 'Play composition', exact: true }).click();
      await expect.poll(() => media.evaluate((element: HTMLMediaElement) => !element.paused && element.currentTime > 0)).toBe(true);
      if (kind === 'audio') {
        const rms = () => page.evaluate(() => {
          const meter = (window as unknown as { cutPreviewMeters: AnalyserNode[] }).cutPreviewMeters.at(-1)!;
          const samples = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(samples);
          return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        });
        let baseline = 0;
        // A partly silent startup window once measured .071 instead of the
        // decoded source's .088; correct .022 quarter gain then falsely failed
        // its unchanged .2.. .3 ratio gate. Calibrate against actual source PCM
        // before retaining a baseline, without adding a sleep or longer timeout.
        await expect.poll(async () => { baseline = await rms(); return baseline / sourceRms; }).toBeGreaterThan(.97);
        expect(baseline / sourceRms).toBeLessThan(1.03);
        await player.getByLabel('Composition volume', { exact: true }).fill('0.25');
        await expect.poll(async () => { const ratio = await rms() / baseline; return ratio > .2 && ratio < .3; }).toBe(true);
        await info.attach('replacement-preview-gain', { body: JSON.stringify({ sourceRms, baselineRms: baseline, quarterGainRms: await rms() }), contentType: 'application/json' });
      }
      await player.getByRole('button', { name: 'Pause composition', exact: true }).click();
    }
    await expect(studio.getByLabel('Unsaved creative edits')).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.unroute(failedPattern);
  });
}
