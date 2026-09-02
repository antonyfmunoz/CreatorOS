import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { renderCutAnimationFrames, launchCutNativeRenderer } from '../server/cut-animation-renderer';
import { createCutNativeBrowserSession } from '../server/cut-native-browser-session';
import { createCutTextRasterizer } from '../server/cut-text-layout-renderer';
import { cutTextLayoutSchema } from '../shared/cut-text-layout';

test('job-scoped native browser reuse preserves actual text and animation pixels with separate contexts', async ({}, info) => {
  const directory = info.outputPath('native-session'); mkdirSync(directory, { recursive: true });
  let launches = 0;
  const session = createCutNativeBrowserSession(async () => { launches++; return launchCutNativeRenderer(); });
  const sharedText = createCutTextRasterizer(session);
  const independentText = createCutTextRasterizer();
  const fixture = path.resolve('tests/fixtures/cut-lottie-basic.json');
  const decode = (file: string) => sharp(file).ensureAlpha().raw().toBuffer();
  const evidence: unknown[] = [];
  try {
    const baseline = await renderCutAnimationFrames({ kind: 'lottie', sourcePath: fixture, outputDirectory: `${directory}/independent`, width: 128, height: 128, fps: 30, duration: .4 });
    const progress: number[] = [];
    const reused = await renderCutAnimationFrames({ kind: 'lottie', sourcePath: fixture, outputDirectory: `${directory}/shared`, width: 128, height: 128, fps: 30, duration: .4, session, onProgress: async (done, total) => { expect(total).toBe(12); progress.push(done); } });
    expect(reused.frameCount).toBe(baseline.frameCount);
    expect(progress).toEqual([10, 12]);
    const frameHashes: string[] = [];
    for (let frame = 0; frame < baseline.frameCount; frame++) {
      const name = `frame-${String(frame).padStart(6, '0')}.png`;
      const expected = await decode(`${directory}/independent/${name}`);
      const actual = await decode(`${directory}/shared/${name}`);
      expect(actual.equals(expected), `animation frame ${frame}`).toBe(true);
      frameHashes.push(createHash('sha256').update(actual).digest('hex'));
    }
    expect(new Set(frameHashes).size).toBeGreaterThan(6);
    evidence.push({ kind: 'lottie', frames: 12, allPixelsExact: true, frameHashes });
    const browser = await session.browser();
    expect(browser.contexts()).toHaveLength(0);
    // A failed layer must release its context without destroying the borrowed
    // job browser; the job owner still closes the session in its own finally.
    const malformed = `${directory}/malformed.json`; writeFileSync(malformed, '{');
    await expect(renderCutAnimationFrames({ kind: 'lottie', sourcePath: malformed, outputDirectory: `${directory}/failed`, width: 128, height: 128, fps: 30, duration: .1, session })).rejects.toThrow();
    expect(browser.contexts()).toHaveLength(0);
    expect(browser.isConnected()).toBe(true);
    const alternateFont = ['C:/Windows/Fonts/times.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'].find(existsSync);
    expect(alternateFont, 'Private alternate font fixture is required').toBeTruthy();
    for (const [index, fontPath] of [undefined, alternateFont].entries()) {
      const input = { text: 'NATIVE\nTypography', layout: cutTextLayoutSchema.parse({ fontSize: 32, align: 'center', verticalAlign: 'middle' }), width: 256, height: 128, canvasWidth: 256, referenceWidth: 256, textColor: '#abcdef', backgroundColor: '#123456', backgroundOpacity: .25, fontPath };
      const expectedFile = `${directory}/independent-text-${index}.png`, actualFile = `${directory}/shared-text-${index}.png`;
      await independentText.render({ ...input, outputPath: expectedFile });
      await sharedText.render({ ...input, outputPath: actualFile });
      const expected = await decode(expectedFile), actual = await decode(actualFile);
      expect(actual.equals(expected), `font ${index} stays context-local`).toBe(true);
      expect(browser.contexts()).toHaveLength(0);
      evidence.push({ kind: 'text', fontIndex: index, allPixelsExact: true, sha256: createHash('sha256').update(actual).digest('hex') });
    }
    expect(launches).toBe(1);
    await sharedText.close();
    expect(browser.isConnected()).toBe(false);
    await expect(session.browser()).rejects.toThrow(/closed/);
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ launches, layersHaveSeparateContexts: true, failedContextReleased: true, closed: true, evidence }, null, 2));
  } finally {
    await independentText.close(); await sharedText.close(); await session.close();
  }
});
