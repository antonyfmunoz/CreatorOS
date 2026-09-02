import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

async function setup(page: Page, info: TestInfo, kind: 'image' | 'video' | 'audio' | 'font' | 'lottie' | 'rive', from = 0) {
  const directory = info.outputPath('buffering'); mkdirSync(directory, { recursive: true });
  const file = `${directory}/source.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
  const uploaded = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: 'video', visibility: 'private', video: { name: 'source.mp4', mimeType: 'video/mp4', buffer: readFileSync(file) } } });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy(); const source = (await uploaded.json()).asset;
  let asset = source;
  if (kind !== 'video') {
    const audio = `${directory}/tone.wav`;
    if (kind === 'audio') execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=500:sample_rate=48000:duration=3', '-c:a', 'pcm_s16le', audio]);
    const lottie = { v: '5.13.0', fr: 30, ip: 0, op: 300, w: 100, h: 100, assets: [], layers: [{ ddd: 0, ind: 1, ty: 1, nm: 'Brand block', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [50, 50, 0] }, s: { a: 0, k: [50, 50, 100] } }, ao: 0, sw: 100, sh: 100, sc: '#00ff88', ip: 0, op: 300, st: 0, bm: 0 }] };
    const payload = kind === 'image' ? { image: { name: 'image.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 32, height: 32, channels: 3, background: '#00cc55' } }).png().toBuffer() } }
      : kind === 'font' ? { font: { name: 'NotoSans.ttf', mimeType: 'font/ttf', buffer: readFileSync('shared/assets/cut-fonts/NotoSans-Variable.ttf') } }
      : kind === 'lottie' ? { lottie: { name: 'brand.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lottie)) } }
      // Same pinned MIT-licensed visible Rive fixture used by the production
      // lifecycle journey; no test-time CDN or external network dependency.
      : kind === 'rive' ? { rive: { name: 'look.riv', mimeType: 'application/octet-stream', buffer: Buffer.from(readFileSync('e2e/fixtures/rive-look.base64.txt', 'utf8').trim(), 'base64') } }
      : { audio: { name: 'tone.wav', mimeType: 'audio/wav', buffer: readFileSync(audio) } };
    const response = await page.request.post('/api/assets/upload-proxy', { multipart: { kind: ['font', 'lottie', 'rive'].includes(kind) ? `cut-${kind}` : kind === 'image' ? 'photo' : 'audio', visibility: 'private', ...payload } });
    expect(response.ok(), await response.text()).toBeTruthy(); asset = (await response.json()).asset;
  }
  const created = await page.request.post('/api/cut/projects', { data: { sourceAssetId: source.id, name: 'Readiness proof', duration: 3, mediaKind: 'video' } });
  expect(created.ok()).toBeTruthy(); const project = await created.json();
  if (asset.id !== source.id) {
    const response = await page.request.post(`/api/cut/projects/${project.id}/media-library`, { data: { assetId: asset.id, name: 'Private resource', duration: 3, mediaKind: kind } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const composed = await page.request.post(`/api/cut/projects/${project.id}/compositions`, { data: { name: 'Buffered composition', manifest: { version: 1, name: 'Buffered composition', width: 480, height: 270, fps: 30, durationInFrames: 300,
    fonts: kind === 'font' ? [{ family: 'Readiness Noto', assetId: asset.id, weight: 400, style: 'normal' }] : [],
    layers: [{ id: 'resource', name: 'Private resource', kind: kind === 'font' ? 'text' : kind, ...(kind === 'font' ? { text: 'Private typography', style: { fontFamily: 'Readiness Noto', fontSize: 40 } } : { assetId: asset.id }), from, durationInFrames: 300 - from, width: 1, height: 1 }],
  } } });
  expect(composed.ok(), await composed.text()).toBeTruthy();
  return { project, asset, player: page.getByLabel('CutStudio creative runtime').getByLabel('CutStudio composition player') };
}

async function framesFor(player: Locator, milliseconds = 600) {
  return player.evaluate((element, duration) => new Promise<number[]>((resolve) => {
    const frames: number[] = []; const start = performance.now();
    const tick = () => { frames.push(Number(element.getAttribute('data-current-frame'))); if (performance.now() - start >= duration) resolve(frames); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), milliseconds);
}

for (const kind of ['image', 'video', 'audio', 'font', 'lottie', 'rive'] as const) {
  test(`composition buffering holds its clock for a private ${kind} and resumes without catching up`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    const { project, asset, player } = await setup(page, info, kind);
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const pattern = `**/api/assets/${asset.id}/stream*`;
    await page.route(pattern, async (route) => { await gate; await route.continue(); });
    try {
      await page.goto(`/cut-studio?project=${project.id}`, { waitUntil: 'domcontentloaded' });
      await expect(player).toHaveAttribute('data-player-state', 'buffering');
      await player.getByRole('button', { name: 'Play composition', exact: true }).click();
      await expect(player).toHaveAttribute('data-play-requested', 'true');
      const held = await framesFor(player); expect(held.length).toBeGreaterThan(5); expect(new Set(held).size).toBe(1);
      release(); await expect(player).toHaveAttribute('data-player-state', 'playing');
      const resumed = await framesFor(player);
      expect(resumed.at(-1)!).toBeGreaterThan(held[0]);
      expect(resumed.at(-1)! - resumed[0]).toBeLessThan(30);
      await player.getByRole('button', { name: 'Pause composition', exact: true }).click();
      await expect(player).toHaveAttribute('data-player-state', 'paused');
      if (kind === 'video' || kind === 'audio') expect(await player.locator(kind).evaluate((element: HTMLMediaElement) => element.readyState >= 2 && element.paused)).toBe(true);
      if (kind === 'font') await expect(player.locator('[data-native-text-content]')).toHaveCSS('font-family', /Readiness Noto/);
      if (kind === 'lottie') await expect(player.getByLabel('Private resource Lottie preview').locator('svg')).toBeVisible();
      if (kind === 'rive') await expect(player.locator('canvas[data-rive-loaded="true"]')).toBeVisible();
      expect(errors).toEqual([]);
    } finally { release(); await page.unroute(pattern); }
  });
}

test('composition buffering respects pause during loading and can retry a failed source', async ({ page }, info) => {
  const { project, asset, player } = await setup(page, info, 'image');
  let fail = true;
  const pattern = `**/api/assets/${asset.id}/stream*`;
  await page.route(pattern, (route) => fail ? route.fulfill({ status: 503, body: 'Synthetic storage failure' }) : route.continue());
  try {
    await page.goto(`/cut-studio?project=${project.id}`);
    await expect(player).toHaveAttribute('data-player-state', 'error');
    await player.getByRole('button', { name: 'Play composition', exact: true }).click();
    const held = await framesFor(player); expect(new Set(held).size).toBe(1);
    await player.getByRole('button', { name: 'Pause composition', exact: true }).click();
    fail = false; await player.getByRole('button', { name: 'Retry preview', exact: true }).click();
    await expect(player).toHaveAttribute('data-player-state', 'paused');
    const paused = await framesFor(player); expect(paused.every((frame) => frame === held[0])).toBe(true);
    const image = player.getByRole('img', { name: 'Private resource' });
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(32);
    await player.getByRole('button', { name: 'Play composition', exact: true }).click();
    expect((await framesFor(player)).at(-1)!).toBeGreaterThan(held[0]);
  } finally { await page.unroute(pattern); }
});

test('composition buffering freezes at a later media layer and retains pause after seeking', async ({ page }, info) => {
  const { project, asset, player } = await setup(page, info, 'video', 30);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const pattern = `**/api/assets/${asset.id}/stream*`;
  await page.route(pattern, async (route) => { await gate; await route.continue(); });
  try {
    await page.goto(`/cut-studio?project=${project.id}`, { waitUntil: 'domcontentloaded' });
    await expect(player).toHaveAttribute('data-player-state', 'paused');
    await player.getByRole('button', { name: 'Play composition', exact: true }).click();
    await expect(player).toHaveAttribute('data-player-state', 'buffering');
    const held = await framesFor(player); expect(new Set(held).size).toBe(1); expect(held[0]).toBeGreaterThanOrEqual(30); expect(held[0]).toBeLessThan(34);
    await player.getByLabel('Preview frame', { exact: true }).fill('75');
    release(); await expect(player).toHaveAttribute('data-player-state', 'paused');
    expect((await framesFor(player)).every((frame) => frame === 75)).toBe(true);
    await expect.poll(() => player.locator('video').evaluate((element: HTMLMediaElement) => element.currentTime)).toBeCloseTo(1.5, 1);
    // A layer can outlast its source; this must hold its final decoded sample,
    // not deadlock after a seek beyond the asset duration.
    await player.getByLabel('Preview frame', { exact: true }).fill('200');
    await expect(player).toHaveAttribute('data-player-state', 'paused');
    await expect.poll(() => player.locator('video').evaluate((element: HTMLMediaElement) => element.currentTime)).toBeGreaterThan(2.9);
    await player.getByRole('button', { name: 'Play composition', exact: true }).click();
    expect((await framesFor(player)).at(-1)!).toBeGreaterThan(200);
    expect(await player.locator('video').evaluate((element: HTMLMediaElement) => element.paused && element.currentTime > 2.9)).toBe(true);
  } finally { release(); await page.unroute(pattern); }
});
