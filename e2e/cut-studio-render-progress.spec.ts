import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createCutProcessProgressParser, cutProcessProgressArgs, cutProcessProgressDisplay, type CutProcessProgress } from '../server/cut-process-progress';

test('native encoder progress matches actual decoded video without exposing paths', async ({}, info) => {
  const directory = info.outputPath('encoder-progress'); mkdirSync(directory, { recursive: true });
  const output = `${directory}/private-qualified-output.mp4`;
  const records: CutProcessProgress[] = [];
  const parse = createCutProcessProgressParser((record) => records.push(record));
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', cutProcessProgressArgs(['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', output]), { windowsHide: true });
    let stderr = ''; child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.stdout.on('data', (chunk) => parse(String(chunk)));
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Synthetic encoder progress test exceeded its bound')); }, 20_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Synthetic encode failed: ${stderr}`)); });
  });
  const probed = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height,duration', '-of', 'json', output], { encoding: 'utf8' })).streams[0];
  expect(probed).toMatchObject({ width: 320, height: 180, nb_read_frames: '60' });
  const final = records.at(-1)!; expect(final).toMatchObject({ frame: 60, complete: true });
  expect(final.seconds).toBeGreaterThan(1.9); expect(final.seconds).toBeLessThanOrEqual(Number(probed.duration));
  expect(cutProcessProgressDisplay(final, Number(probed.duration)).progress).toBeLessThan(1);
  expect(JSON.stringify(records)).not.toMatch(/private-qualified|https?:|\.mp4|\\|encoder-progress/);
  // Decode actual pixels as well as reading container metadata.
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1024 * 1024 });
  expect(pixels.length).toBe(320 * 180 * 3); expect(new Set(pixels).size).toBeGreaterThan(100);
  await info.attach('native-encoder-progress', { body: JSON.stringify({ records, probed }, null, 2), contentType: 'application/json' });
});
