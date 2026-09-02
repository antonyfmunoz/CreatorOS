import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { cutGraphicCurvesSchema } from '../shared/cut-graphic-curves';
import { cutGraphicCurveExpression } from '../server/cut-curve-expression';
import { cutGraphicColorFilters } from '../server/cut-graphic-color';
import { cutGraphicOpacityFilters } from '../server/cut-graphic-opacity';
import { cutFilterGraphArgs } from '../server/cut-filter-graph';
import { cutRasterInputArgs } from '../server/cut-render-duration';

for (const fps of [24, 30, 60]) {
  test(`frame-uniform scalar cache preserves every RGBA sample at ${fps} fps across filter slices`, async ({}, info) => {
    const directory = info.outputPath('frame-scalars'); mkdirSync(directory, { recursive: true });
    const width = 64, height = 32;
    const source = Buffer.alloc(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) source.set([pixel % 256, 255 - pixel % 256, pixel * 7 % 256, pixel % 256], pixel * 4);
    const png = `${directory}/all-alpha.png`;
    await sharp(source, { raw: { width, height, channels: 4 } }).png().toFile(png);
    const model = cutGraphicCurvesSchema.parse({ version: 1, fps, durationInFrames: fps,
      curves: ['brightness', 'saturation', 'opacity'].map((property, index) => ({ property, base: 1,
        keyframes: ['linear', 'spring', 'step', 'ease_in_out', 'ease_in', 'ease_out'].map((easing, point) => ({
          frame: Math.floor(point * (fps - 1) / 5), value: property === 'opacity' ? [1, .3, .8, .1, .6, 1][point] : [.2, 1.7, .4, 3.5, .8, 1.2][(point + index) % 6], easing,
        })),
      })),
      transitions: [{ phase: 'enter', kind: 'fade', durationInFrames: 4, easing: 'spring' }, { phase: 'exit', kind: 'fade', durationInFrames: 5, easing: 'ease_out' }],
    });
    const expression = (property: 'brightness' | 'saturation' | 'opacity') => cutGraphicCurveExpression(model, property, 0, 'T')!;
    const cases = [
      { brightness: expression('brightness'), saturation: expression('saturation'), opacity: expression('opacity'), contrast: .7 },
      { brightness: expression('brightness'), saturation: '1', opacity: '0.3+T/2', contrast: 1.3 },
      { brightness: '.7', saturation: '4', opacity: expression('opacity'), contrast: 1 },
    ];
    const receipts: unknown[] = [];
    let canonical: Buffer | undefined;
    for (const threads of [1, 2, 4]) {
      // Alternate order so warm-up cannot consistently favor the optimization.
      for (const cached of threads === 2 ? [true, false] : [false, true]) {
        const runDirectory = `${directory}/${threads}-${cached ? 'cached' : 'baseline'}`;
        mkdirSync(runDirectory, { recursive: true });
        const filters: string[] = [];
        cases.forEach((entry, index) => {
          filters.push(`[${index}:v]settb=AVTB,${cutGraphicColorFilters(entry.brightness, entry.saturation, `colors${index}`, entry.contrast, { frameUniform: cached }).join(',')}[color${index}]`);
          filters.push(...cutGraphicOpacityFilters(`color${index}`, `result${index}`, entry.opacity, { frameUniform: cached }));
        });
        filters.push(`${cases.map((_, index) => `[result${index}]`).join('')}hstack=inputs=${cases.length}[output]`);
        const graph = await cutFilterGraphArgs(runDirectory, filters);
        const inputs = cases.flatMap(() => cutRasterInputArgs({ path: png, animated: false }, fps, 1));
        const started = performance.now();
        const output = execFileSync('ffmpeg', ['-v', 'error', '-filter_complex_threads', String(threads), ...inputs, ...graph, '-map', '[output]', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
        const elapsedMs = performance.now() - started;
        expect(output.length).toBe(width * cases.length * height * 4 * fps);
        if (!canonical) canonical = output;
        else expect(output.equals(canonical), `all samples match uncached, threads=${threads}, cached=${cached}`).toBe(true);
        // Prevent an accidentally constant/silent fixture from proving equality.
        const frameBytes = width * cases.length * height * 4;
        const frameHashes = Array.from({ length: fps }, (_, frame) => createHash('sha256').update(output.subarray(frame * frameBytes, (frame + 1) * frameBytes)).digest('hex'));
        expect(new Set(frameHashes).size).toBeGreaterThan(fps / 2);
        receipts.push({ threads, cached, elapsedMs, bytes: output.length, frames: fps, sha256: createHash('sha256').update(output).digest('hex'), frameHashes });
      }
    }
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ fps, allSamplesExact: true, receipts }, null, 2));
  });
}
