import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyVideoFrames({ image, directory }) {
  const records = [];
  const capsule = (code, file, bytes) => Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'main.tsx': strToU8(`import {FrameVideo,FullFrame} from '@creativesos/cut';import clip from './${file}';${code}`), [file]: bytes }));
  const base = { version: 1, mode: 'sequence', width: 128, height: 72, fps: 10, durationInFrames: 20, entrypoint: 'main.tsx', input: {} };
  const rgb = Buffer.alloc(128 * 72 * 3 * 10);
  for (let frame = 0; frame < 10; frame++) for (let pixel = 0; pixel < 128 * 72; pixel++) rgb[(frame * 128 * 72 + pixel) * 3 + (frame % 2 ? 2 : 0)] = 255;
  const variableFile = `${directory}private-video-variable-pts.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '128x72', '-r', '10', '-i', 'pipe:0', '-vf', 'select=eq(n\\,0)+eq(n\\,1)+eq(n\\,3)+eq(n\\,6)+eq(n\\,9)', '-fps_mode', 'vfr', '-c:v', 'libx264', '-threads', '1', '-x264-params', 'b-adapt=0:bframes=2:keyint=10', '-pix_fmt', 'yuv420p', variableFile], { input: rgb, windowsHide: true, timeout: 10_000 });
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time:stream=has_b_frames:format=duration', '-of', 'json', variableFile], { encoding: 'utf8', windowsHide: true, timeout: 10_000 }));
  assert.deepEqual(probe.frames.map(frame => Number(frame.best_effort_timestamp_time)), [0,.1,.3,.6,.9]);
  assert.ok(probe.streams[0].has_b_frames > 0, 'The variable-rate fixture must also exercise reordered decode frames.');
  assert.equal(Number(probe.format.duration), 1);
  const variableSource = capsule('export default ()=> <FrameVideo src={clip} repeat/>;', 'clip.mp4', await readFile(variableFile));
  const rendered = await renderIsolated({ request: base, source: variableSource, image });
  await writeFile(`${directory}private-video-variable-pts.zip`, rendered.artifact);
  const frames = unzipSync(rendered.artifact), manifest = JSON.parse(strFromU8(frames['manifest.json']));
  const images = manifest.frames.map(frame => Buffer.from(frames[frame.filename]));
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'image2pipe', '-i', 'pipe:0', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: Buffer.concat(images), maxBuffer: 100_000, windowsHide: true, timeout: 10_000 });
  assert.equal(pixels.length, 20 * 3);
  for (let frame = 0; frame < 20; frame++) {
    const local = frame % 10, channel = local === 0 || (local >= 6 && local < 9) ? 0 : 2;
    assert.ok(pixels[frame * 3 + channel] > 240, `VFR presentation interval at output frame ${frame} must select its real source frame.`);
  }
  for (const frame of [3,6,9]) {
    const independent = await renderIsolated({ request: { ...base, mode: 'still', frame }, source: variableSource, image });
    await writeFile(`${directory}private-video-variable-pts-${frame}.png`, independent.artifact);
    assert.deepEqual(independent.artifact, images[frame], 'Random access and sequential video-frame capture must agree exactly.');
  }
  records.push({ test: 'private-video-vfr-bframes-repeat-and-random-access', ...rendered.receipt, probe });

  const rgba = Buffer.alloc(128 * 72 * 4 * 3);
  for (let frame = 0; frame < 3; frame++) for (let y = 0; y < 72; y++) for (let x = 0; x < 64; x++) {
    const offset = ((frame * 72 + y) * 128 + x) * 4; rgba[offset + 2] = 255; rgba[offset + 3] = 255;
  }
  const alphaFile = `${directory}private-video-alpha.webm`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '128x72', '-r', '10', '-i', 'pipe:0', '-c:v', 'libvpx-vp9', '-threads', '1', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '0', alphaFile], { input: rgba, windowsHide: true, timeout: 10_000 });
  const alpha = await renderIsolated({ request: { ...base, mode: 'still', frame: 1, durationInFrames: 3 }, source: capsule('export default ()=> <FullFrame style={{background:"#ff0000"}}><FrameVideo src={clip}/></FullFrame>;', 'clip.webm', await readFile(alphaFile)), image });
  await writeFile(`${directory}private-video-alpha.png`, alpha.artifact);
  const decoded = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: alpha.artifact, maxBuffer: 100_000, windowsHide: true, timeout: 10_000 });
  const sample = x => [...decoded.subarray((36 * 128 + x) * 3, (36 * 128 + x) * 3 + 3)];
  assert.ok(sample(20)[2] > 240 && sample(100)[0] > 240 && sample(100)[2] < 10, 'Private VP9 alpha must preserve the authored background through transparent pixels.');
  records.push({ test: 'private-video-webm-alpha-decoded-overlay', ...alpha.receipt });
  console.log('PASS timestamp-indexed private VFR/B-frame loops, exact independent stills and VP9 alpha overlay');
  return records;
}
