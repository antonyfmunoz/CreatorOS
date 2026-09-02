import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cutFilterGraphArgs } from '../server/cut-filter-graph';

test('private native filter files select supported syntax for the installed FFmpeg', async ({}, info) => {
  const directory = info.outputPath('owned filter Ω workspace'); mkdirSync(directory, { recursive: true });
  const filters = ["[0:v]format=rgba[source]", "[source]geq=r='N*40':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)'[result]"];
  const args = await cutFilterGraphArgs(directory, filters);
  expect(['-filter_complex_script', '-/filter_complex']).toContain(args[0]);
  const output = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=4x4:r=3:d=1', ...args, '-map', '[result]', '-frames:v', '3', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
  expect(output.length).toBe(3 * 4 * 4 * 4);
  let maximumError = 0;
  for (let frame = 0; frame < 3; frame++) for (let pixel = 0; pixel < 16; pixel++) {
    const offset = frame * 64 + pixel * 4;
    const expected = [frame * 40, 0, 0, 255];
    for (let channel = 0; channel < 4; channel++) maximumError = Math.max(maximumError, Math.abs(output[offset + channel] - expected[channel]));
  }
  expect(maximumError).toBe(0);
  writeFileSync(info.outputPath('filter-file-receipt.json'), JSON.stringify({ option: args[0], frames: 3, comparedBytes: output.length, maximumError, utf8Path: true }, null, 2));
});
