import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { cutFilterThreadArgs } from '../server/cut-filter-budget';
import { cutFilterGraphArgs } from '../server/cut-filter-graph';
import { cutGraphicColorFilters } from '../server/cut-graphic-color';
import { cutGraphicOpacityFilters } from '../server/cut-graphic-opacity';
import { cutRasterInputArgs } from '../server/cut-render-duration';

test('bounded complex filter pools retain exact animated color alpha and geometry frames', async ({}, info) => {
  const directory = info.outputPath('filter-budget'); mkdirSync(directory, { recursive: true });
  const source = Buffer.alloc(16 * 16 * 4);
  for (let pixel = 0; pixel < 256; pixel++) source.set([pixel, 255 - pixel, pixel * 7 % 256, pixel], pixel * 4);
  const png = `${directory}/all-alpha.png`;
  await sharp(source, { raw: { width: 16, height: 16, channels: 4 } }).png().toFile(png);
  const inputs = Array.from({ length: 8 }, () => cutRasterInputArgs({ path: png, animated: false }, 30, 1)).flat();
  const filters: string[] = [];
  for (let index = 0; index < 8; index++) {
    const colors = cutGraphicColorFilters(index % 2 ? '0.5+T' : '.8', String(index / 2), `color${index}`, index % 3 ? .7 : 1.2);
    filters.push(`[${index}:v]settb=AVTB,${colors.join(',')},scale=64:64,rotate='0.15*sin(t)':ow=64:oh=64:c=none[prepared${index}]`);
    filters.push(...cutGraphicOpacityFilters(`prepared${index}`, `picture${index}`, 'clip(0.5+T/2,0,1)'));
  }
  filters.push(`${Array.from({ length: 8 }, (_, index) => `[picture${index}]`).join('')}hstack=inputs=8[output]`);
  const graph = await cutFilterGraphArgs(directory, filters);
  let baseline: string[] | undefined;
  const receipts: unknown[] = [];
  for (const threads of [undefined, 1, 2, 4]) {
    const options = threads === undefined ? [] : cutFilterThreadArgs({ CUT_FILTER_THREADS: String(threads) });
    const started = Date.now();
    const result = execFileSync('ffmpeg', ['-v', 'error', ...options, ...inputs, ...graph, '-map', '[output]', '-pix_fmt', 'rgba', '-f', 'framemd5', 'pipe:1'], { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 }).toString();
    const frames = result.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    expect(frames).toHaveLength(30);
    if (!baseline) baseline = frames;
    else expect(frames, `decoded RGBA equality with ${threads} graph threads`).toEqual(baseline);
    const mode = threads === undefined ? 'automatic' : String(threads);
    writeFileSync(`${directory}/${mode}.framemd5`, result);
    receipts.push({ mode, elapsedMs: Date.now() - started, frames: frames.length, rgbaMatchesAutomatic: true });
  }
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ inputs: 8, receipts }, null, 2));
});
