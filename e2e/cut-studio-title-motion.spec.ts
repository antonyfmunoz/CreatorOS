import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { waitForCutRender } from './helpers/cut-render';

test('native title motion preserves private-font travel growth and rotation without occlusion', async ({ page }, info) => {
  test.setTimeout(120_000);
  const directory = info.outputPath('title-motion'); mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath]);
  const uploaded = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(sourcePath) } } });
  expect(uploaded.ok()).toBeTruthy(); const source = (await uploaded.json()).asset;
  const fontPath = ['C:/Windows/Fonts/times.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'].find(existsSync);
  expect(fontPath, 'A system TTF is required for the private-font render proof').toBeTruthy();
  const fontUpload = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'cut-font', visibility: 'private', font: { name: 'private-proof.ttf', mimeType: 'font/ttf', buffer: readFileSync(fontPath!) } } });
  expect(fontUpload.ok(), await fontUpload.text()).toBeTruthy(); const font = (await fontUpload.json()).asset;
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Unoccluded title motion', duration: 2, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  const fontMedia = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: font.id, name: 'Private proof', duration: 2, mediaKind: 'font' } });
  expect(fontMedia.ok(), await fontMedia.text()).toBeTruthy();
  // The same authored title as the full cinema lifecycle, with the other
  // overlapping colored/effect layers removed only from this measurement.
  const manifest = { version: 1, name: 'Unoccluded title', width: 1920, height: 1080, fps: 30, durationInFrames: 60,
    fonts: [{ family: 'PrivateProof', assetId: font.id, weight: 400, style: 'normal' }], layers: [
      { id: 'source', name: 'Source', kind: 'video', assetId: source.id, from: 0, durationInFrames: 60 },
      { id: 'hero_title', name: 'Hero title', kind: 'text', from: 15, durationInFrames: 45, text: 'A connected creative system', x: .15, y: .42, width: .72, height: .2, rotation: -8, style: { fontSize: 72, color: '#ffffff', backgroundColor: '#1d9bf0', backgroundOpacity: .88, fontFamily: 'PrivateProof' },
        enter: { kind: 'slide', durationInFrames: 12, easing: 'ease_in_out', direction: 'right' }, exit: { kind: 'fade', durationInFrames: 12, easing: 'ease_out' },
        animations: [
          { property: 'opacity', keyframes: [{ frame: 0, value: 0, easing: 'ease_out' }, { frame: 12, value: 1, easing: 'ease_out' }] },
          { property: 'scale', keyframes: [{ frame: 0, value: .72, easing: 'spring' }, { frame: 18, value: 1, easing: 'spring' }, { frame: 44, value: 1.4, easing: 'ease_in_out' }] },
        ] },
    ] };
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Title motion', manifest } });
  expect(composed.ok(), await composed.text()).toBeTruthy(); const composition = await composed.json();
  const applied = await page.request.post(`/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, { headers: { 'If-Match': String(project.revision) } });
  expect(applied.ok(), await applied.text()).toBeTruthy();
  const rendered = await page.request.post(`/api/cut/projects/${project.id}/render`, { data: { aspect: '16:9', captions: false, cleanAudio: false, quality: 'draft', resolution: '720p', fps: 24 } });
  expect(rendered.ok()).toBeTruthy(); const job = await rendered.json();
  await waitForCutRender(page.request, job.id, info);
  const completed = await (await page.request.get(`/api/cut/jobs/${job.id}`)).json();
  expect(completed, completed.detail).toMatchObject({ state: 'done', artifactAssetId: expect.any(String) });
  const media = await (await page.request.get(`/api/cut/jobs/${job.id}/media`)).json();
  const artifact = await page.request.get(media.url); expect(artifact.ok()).toBeTruthy();
  const renderedPath = `${directory}/title-motion.mp4`; writeFileSync(renderedPath, await artifact.body());
  const brandBounds = (seconds: number) => {
    const pixels = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', renderedPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    let minimumX = 1280; let maximumX = -1; let minimumY = 720; let maximumY = -1; let count = 0;
    for (let offset = 0; offset + 2 < pixels.length; offset += 3) {
      const red = pixels[offset]; const green = pixels[offset + 1]; const blue = pixels[offset + 2];
      if (blue > 30 && blue > green + 12 && green > red + 10) {
        const x = Math.floor(offset / 3) % 1280; const y = Math.floor(Math.floor(offset / 3) / 1280);
        minimumX = Math.min(minimumX, x); maximumX = Math.max(maximumX, x); minimumY = Math.min(minimumY, y); maximumY = Math.max(maximumY, y); count++;
      }
    }
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(seconds), '-i', renderedPath, '-frames:v', '1', `${directory}/frame-${seconds}.png`]);
    return { minimumX, maximumX, minimumY, maximumY, count };
  };
  const openingTitle = brandBounds(.55); const settledTitle = brandBounds(1.1);
  writeFileSync(`${directory}/bounds.json`, JSON.stringify({ openingTitle, settledTitle }, null, 2));
  expect(openingTitle.count).toBeGreaterThan(1_000);
  expect(settledTitle.count).toBeGreaterThan(1_000);
  expect(openingTitle.minimumX - settledTitle.minimumX).toBeGreaterThan(120);
  expect(settledTitle.count).toBeGreaterThan(openingTitle.count * 1.05);
  expect(settledTitle.maximumY - settledTitle.minimumY).toBeGreaterThan(180);
});
