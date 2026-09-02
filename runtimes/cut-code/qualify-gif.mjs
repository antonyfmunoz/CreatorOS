import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

// Read actual GIF blocks, not an encoder-side promise. Compressed image bytes
// are skipped by their length so marker-like pixel data cannot fake metadata.
function gifMetadata(bytes) {
  assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
  let offset = 13 + (bytes[10] & 128 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0);
  const delays = [];
  let loop = undefined, frames = 0;
  const blocks = () => {
    const parts = [];
    while (bytes[offset]) { const size = bytes[offset++]; assert.ok(offset + size < bytes.length); parts.push(bytes.subarray(offset, offset + size)); offset += size; }
    offset++;
    return Buffer.concat(parts);
  };
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[offset++];
      const data = blocks();
      if (label === 0xf9) { assert.equal(data.length, 4); delays.push(data.readUInt16LE(1)); }
      if (label === 0xff && data.subarray(0, 11).toString() === 'NETSCAPE2.0') { assert.equal(data[11], 1); loop = data.readUInt16LE(12); }
    } else {
      assert.equal(marker, 0x2c);
      frames++;
      const flags = bytes[offset + 8]; offset += 9;
      if (flags & 128) offset += 3 * 2 ** ((flags & 7) + 1);
      offset++; blocks();
    }
  }
  assert.equal(delays.length, frames);
  return { width, height, frames, delays, loop: loop ?? null };
}

export async function qualifyGif({ image, directory }) {
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'index.tsx': strToU8(`import {useFrame} from '@creativesos/cut';export default function Scene(){const f=useFrame();return <><div style={{position:'absolute',left:f*4,top:4,width:6,height:6,background:'#00ff00'}}/><div style={{position:'absolute',left:2,top:20,width:6,height:6,background:'#ff0000'}}/></>}`) }));
  const base = { version: 1, mode: 'video', format: 'gif', width: 65, height: 33, fps: 25, durationInFrames: 30, frameRange: [3, 9], entrypoint: 'index.tsx', input: {}, gifOptions: { frameStep: 3, repeatCount: null } };
  const records = [];
  let first;
  for (const repeatCount of [null, 0, 2]) {
    const result = await renderIsolated({ request: { ...base, gifOptions: { frameStep: 3, repeatCount } }, source, image });
    const file = `${directory}sampled-${repeatCount ?? 'infinite'}.gif`;
    await writeFile(file, result.artifact);
    const metadata = gifMetadata(result.artifact);
    assert.deepEqual(metadata, { width: 65, height: 33, frames: 3, delays: [12, 12, 4], loop: repeatCount === null ? 0 : repeatCount === 0 ? null : repeatCount });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-ignore_loop', '1', '-show_entries', 'stream=codec_name,codec_type,width,height:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
    assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, 'gif');
    assert.ok(Math.abs(Number(probe.format.duration) - .28) < .001);
    const rgba = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-ignore_loop', '1', '-i', file, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { windowsHide: true, maxBuffer: 1_000_000, timeout: 10000 });
    assert.equal(rgba.length, 3 * 65 * 33 * 4);
    const pixel = (frame, x, y) => [...rgba.subarray(((frame * 33 + y) * 65 + x) * 4, ((frame * 33 + y) * 65 + x) * 4 + 4)];
    for (let index = 0; index < 3; index++) {
      assert.deepEqual(pixel(index, (3 + index * 3) * 4 + 2, 6), [0, 255, 0, 255], 'Sampled frames must retain absolute composition time.');
      assert.deepEqual(pixel(index, 4, 22), [255, 0, 0, 255]);
      assert.equal(pixel(index, 60, 30)[3], 0);
      if (index) assert.equal(pixel(index, 14, 6)[3], 0, 'Moving transparent output must not leave a trail from earlier frames.');
    }
    assert.equal(result.receipt.frames, 3); assert.equal(result.receipt.silent, true);
    if (repeatCount === null) first = result;
    records.push({ test: `gif-sampled-repeat-${repeatCount ?? 'infinite'}`, ...result.receipt, metadata, probe });
  }
  const replay = await renderIsolated({ request: base, source, image });
  assert.equal(replay.receipt.artifactSha256, first.receipt.artifactSha256);
  const fractional = await renderIsolated({ request: { ...base, fps: 30 }, source, image });
  assert.deepEqual(gifMetadata(fractional.artifact).delays, [10, 10, 3]);
  const single = await renderIsolated({ request: { ...base, fps: 50, frameRange: [3, 3] }, source, image });
  assert.deepEqual(gifMetadata(single.artifact).delays, [2]);
  await assert.rejects(renderIsolated({ request: { ...base, audioTracks: [{ file: 'tone.wav' }] }, source, image }), /soundtrack/);
  await assert.rejects(renderIsolated({ request: { ...base, width: 1920, height: 1080, durationInFrames: 60, frameRange: [0, 59] }, source, image }), /palette memory budget/);
  records.push({ test: 'gif-centisecond-timing-single-frame-replay-admission', ...fractional.receipt, metadata: gifMetadata(fractional.artifact), singleFrame: single.receipt });
  console.log('PASS actual GIF palettes, transparent moving frames, sampling/range timing, repeat metadata, replay and admission limits');
  return records;
}
