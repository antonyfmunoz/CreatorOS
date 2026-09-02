import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cutGraphicOpacityFilters } from '../server/cut-graphic-opacity';

test('native opacity preserves every RGBA byte while avoiding redundant color evaluation', async ({}, info) => {
  const width = 32, height = 16, frames = 6, frameBytes = width * height * 4;
  const input = Buffer.alloc(frameBytes * frames);
  for (let frame = 0; frame < frames; frame++) for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = frame * frameBytes + pixel * 4;
    input[offset] = pixel % 256;
    input[offset + 1] = (pixel * 3) % 256;
    input[offset + 2] = (pixel * 7) % 256;
    input[offset + 3] = pixel % 256;
  }
  const receipts: unknown[] = [];
  for (const expression of ['0', '0.003', '0.6', '0.999', '1', '0.3+0.3*sin(T*PI)*sin(T*PI)', 'if(lt(T,0.5),0.25,0.75)']) {
    const baseline = [`[0:v]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${expression})'[result]`];
    const optimized = cutGraphicOpacityFilters('source', 'result', expression).map((filter) => filter.replace('[source]', '[0:v]'));
    const output = [baseline, optimized].map((filters) => execFileSync('ffmpeg', [
      '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', '6', '-i', 'pipe:0',
      '-filter_complex', filters.join(';'), '-map', '[result]', '-frames:v', String(frames), '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1',
    ], { input, windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 }));
    expect(output[0].length).toBe(input.length);
    expect(output[1].length).toBe(input.length);
    expect(output[1].equals(output[0]), `exact RGBA comparison for ${expression}`).toBeTruthy();
    let maximumAlphaRounding = 0, maximumColorError = 0;
    for (let frame = 0; frame < frames; frame++) for (let pixel = 0; pixel < width * height; pixel++) {
      const offset = frame * frameBytes + pixel * 4;
      const opacity = expression.startsWith('0.3+') ? .3 + .3 * Math.sin(frame / 6 * Math.PI) ** 2
        : expression.startsWith('if(') ? (frame < 3 ? .25 : .75) : Number(expression);
      for (let channel = 0; channel < 3; channel++) maximumColorError = Math.max(maximumColorError, Math.abs(output[1][offset + channel] - input[offset + channel]));
      maximumAlphaRounding = Math.max(maximumAlphaRounding, Math.abs(output[1][offset + 3] - Math.floor(input[offset + 3] * opacity)));
    }
    // JS and FFmpeg double precision can lie on opposite sides of an integer.
    // This independent formula check does not relax the exact native comparison.
    expect(maximumAlphaRounding).toBeLessThanOrEqual(1);
    // Compare every channel, but emit one trace assertion instead of tens of
    // thousands of Playwright trace steps for this synchronous byte loop.
    expect(maximumColorError).toBe(0);
    receipts.push({ expression, frames, comparedBytes: input.length, exactNativeMatch: true, maximumAlphaRounding, maximumColorError });
  }
  writeFileSync(info.outputPath('opacity-byte-comparison.json'), JSON.stringify(receipts, null, 2));
});
