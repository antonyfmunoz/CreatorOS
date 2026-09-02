import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cutCodecThreadArgs } from '../server/cut-codec-budget';
import { cutFilterThreadArgs } from '../server/cut-filter-budget';

test('bounded native codecs preserve all lossless frames and master rendition controls', async ({}, info) => {
  const directory = info.outputPath('codec-budget'); mkdirSync(directory, { recursive: true });
  const run = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024 * 1024 });
  const source = `${directory}/source.mkv`;
  run(['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=24:d=0.5', '-c:v', 'ffv1', '-threads:v', '1', source]);
  const hashes = (file: string, threads: number) => run([...cutCodecThreadArgs({ CUT_CODEC_THREADS: String(threads) }), '-i', file, '-map', '0:v', '-pix_fmt', 'yuv420p', '-f', 'framemd5', 'pipe:1']).toString().split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  const expected = hashes(source, 1); expect(expected).toHaveLength(12);
  const evidence: unknown[] = [];
  for (const threads of [1, 2]) {
    const options = cutCodecThreadArgs({ CUT_CODEC_THREADS: String(threads) });
    const output = `${directory}/lossless-${threads}.mp4`;
    run([...options, '-i', source, '-c:v', 'libx264', ...options, '-preset', 'medium', '-crf', '0', '-pix_fmt', 'yuv420p', output]);
    expect(hashes(output, threads), `all decoded samples at ${threads} codec threads`).toEqual(expected);
    evidence.push({ threads, frames: 12, losslessDecodedSamplesExact: true });
  }
  const master = `${directory}/master.mp4`;
  run([...cutFilterThreadArgs({}, 2), ...cutCodecThreadArgs({}, 2), '-i', source, '-filter_complex', '[0:v]setpts=PTS-STARTPTS,fps=24[out]', '-map', '[out]', '-c:v', 'libx264', ...cutCodecThreadArgs({}, 2), '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', master]);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', master], { windowsHide: true, timeout: 5_000 }).toString()).streams[0];
  expect(probe).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '24/1', nb_frames: '12', pix_fmt: 'yuv420p' });
  // Evaluate the complete actual output against its uncompressed source. Thread
  // counts can change lossy bitstreams; this is not a byte-equality assertion.
  // Decode every YUV sample for an independent whole-output PSNR check.
  const decode = (file: string) => run([...cutCodecThreadArgs({}, 2), '-i', file, '-map', '0:v', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', 'pipe:1']);
  const reference = decode(source), actual = decode(master);
  expect(actual.length).toBe(reference.length);
  let sum = 0;
  for (let index = 0; index < reference.length; index++) sum += (reference[index] - actual[index]) ** 2;
  const psnr = 10 * Math.log10(255 ** 2 / (sum / reference.length));
  expect(psnr).toBeGreaterThan(40);
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ evidence, master: { width: probe.width, height: probe.height, frames: 12, fps: 24, preset: 'medium', crf: 16, psnrDb: psnr }, limits: 'per codec only, not process memory or aggregate CPU' }, null, 2));
});
