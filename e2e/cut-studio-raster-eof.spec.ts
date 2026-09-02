import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cutRasterInputArgs, cutRenderDurationArgs } from '../server/cut-render-duration';
import { cutGraphicOpacityFilters } from '../server/cut-graphic-opacity';
import sharp from 'sharp';

test('bounded raster decoder pools preserve every decoded frame and alpha byte', async ({}, info) => {
  const directory = info.outputPath('raster-decode'); mkdirSync(directory, { recursive: true });
  const source = Buffer.alloc(16 * 16 * 4);
  for (let pixel = 0; pixel < 256; pixel++) source.set([pixel, 255 - pixel, pixel * 7 % 256, pixel], pixel * 4);
  const png = `${directory}/all-alpha.png`;
  await sharp(source, { raw: { width: 16, height: 16, channels: 4 } }).png().toFile(png);
  const decoded = new Map<string, string[]>(); const receipts: unknown[] = [];
  for (const bounded of [false, true]) {
    const inputs = Array.from({ length: 8 }, () => {
      const args = cutRasterInputArgs({ path: png, animated: false }, 24, 1);
      if (!bounded) args.splice(args.indexOf('-threads:v'), 2);
      return args;
    }).flat();
    const graph = `${Array.from({ length: 8 }, (_, index) => `[${index}:v]`).join('')}hstack=inputs=8[stacked]`;
    const started = Date.now();
    const result = execFileSync('ffmpeg', ['-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[stacked]', '-pix_fmt', 'rgba', '-f', 'framemd5', 'pipe:1'], { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 }).toString();
    const mode = bounded ? 'bounded' : 'automatic';
    writeFileSync(`${directory}/${mode}.framemd5`, result);
    const frames = result.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    expect(frames).toHaveLength(24); decoded.set(mode, frames);
    receipts.push({ mode, elapsedMs: Date.now() - started, inputs: 8, frames: frames.length });
  }
  expect(decoded.get('bounded')).toEqual(decoded.get('automatic'));
  writeFileSync(`${directory}/receipt.json`, JSON.stringify({ receipts, decodedRgbaIdentical: true }, null, 2));
});

test('finite raster sources flush delayed alpha overlays and preserve the final encoded frame', async ({}, info) => {
  const directory = info.outputPath('raster-eof'); mkdirSync(directory, { recursive: true });
  const png = `${directory}/owned.png`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red@0.8:s=16x16,format=rgba', '-frames:v', '1', '-threads', '1', png], { windowsHide: true, timeout: 10_000 });
  // No output -t/-frames/shortest guard: the input itself must reach EOF.
  const raw = execFileSync('ffmpeg', ['-v', 'error', ...cutRasterInputArgs({ path: png, animated: false }, 24, 2), '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
  expect(raw.length).toBe(48 * 16 * 16 * 4);
  const receipts: unknown[] = [];
  for (const fps of [24, 30, 60]) {
    const output = `${directory}/overlay-${fps}.mp4`;
    const filters = ['[0:v]settb=AVTB[base]', '[2:v]format=rgba,setpts=PTS+0.5/TB[prepared]',
      ...cutGraphicOpacityFilters('prepared', 'graphic', 'clip((T-0.5)*2,0,1)'),
      "[base][graphic]overlay=x=100:y=60:eof_action=repeat:shortest=0:enable='between(t,0.5,2)'[finished]"];
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=blue:s=320x180:r=${fps}:d=2`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=2',
      ...cutRasterInputArgs({ path: png, animated: false }, fps, 2), '-filter_complex', filters.join(';'), '-map', '[finished]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      ...cutRenderDurationArgs(2), '-shortest', output], { windowsHide: true, timeout: 15_000 });
    const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,duration,avg_frame_rate', '-of', 'json', output], { windowsHide: true }).toString());
    expect(Number(metadata.streams[0].nb_frames)).toBe(fps * 2);
    expect(Number(metadata.streams[0].duration)).toBeCloseTo(2, 6);
    const last = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-vf', `select=eq(n\\,${fps * 2 - 1})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
    expect(last.length).toBe(320 * 180 * 3);
    const sample = (68 * 320 + 108) * 3;
    expect(last[sample], 'last frame retains the translucent red overlay').toBeGreaterThan(180);
    receipts.push({ fps, ...metadata.streams[0], finalFrameDecoded: true });
  }
  writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipts, null, 2));
});
