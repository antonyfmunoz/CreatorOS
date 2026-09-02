import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

// Compare every decoded RGB sample against independent lossless PNG captures.
// All content is generated here, not taken from a competitor or user project.
export async function qualifyLosslessRgb({ image, directory }) {
  const tone = Buffer.alloc(44 + 48000 * 2);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(48000, 24); tone.writeUInt32LE(96000, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
  tone.write('data', 36); tone.writeUInt32LE(tone.length - 44, 40);
  for (let sample = 0; sample < 48000; sample++) tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * sample / 48000) * 8000), 44 + sample * 2);
  const code = `import {useLayoutEffect,useRef} from 'react';import {useFrame} from '@creativesos/cut';
export default function Scene(){const ref=useRef(null),frame=useFrame();useLayoutEffect(()=>{const c=ref.current.getContext('2d');const p=c.createImageData(96,64);let seed=9287+frame*1223;for(let i=0;i<96*64;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;p.data.set([seed&255,(seed>>>8)&255,(seed>>>16)&255,255],i*4);}c.putImageData(p,0,0);for(let x=0;x<96;x++){c.fillStyle=x%3===0?'#ff0000':x%3===1?'#00ff00':'#0000ff';c.fillRect(x,frame+3,1,8);}},[frame]);return <canvas style={{display:'block'}} ref={ref} width={96} height={64}/>}`;
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'main.tsx': strToU8(code), 'sound.wav': tone }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const base = { version: 1, mode: 'video', format: 'mp4', width: 96, height: 64, fps: 12, durationInFrames: 6, entrypoint: 'main.tsx', input: {} };
  const decode = (bytes) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', 'pipe:0', '-map', '0:v:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: bytes, maxBuffer: 2_000_000, timeout: 10_000, windowsHide: true });
  const sequence = await renderIsolated({ request: { ...base, mode: 'sequence', format: 'png' }, source, image });
  await writeFile(`${directory}lossless-rgb-reference.zip`, sequence.artifact);
  const frames = unzipSync(sequence.artifact);
  const expected = Array.from({ length: 6 }, (_, frame) => decode(Buffer.from(frames[`frame-${String(frame).padStart(6, '0')}.png`])));
  for (const bytes of expected) assert.equal(bytes.length, 96 * 64 * 3);
  assert.notDeepEqual(expected[0], expected[1], 'Reference must actually change between frames.');
  const records = [{ test: 'lossless-rgb-independent-png-reference', ...sequence.receipt }];
  const fullRequest = { ...base, videoEncoding: { losslessRgb: true, preset: 'fast' } };
  const full = await renderIsolated({ request: fullRequest, source, image });
  const repeated = await renderIsolated({ request: fullRequest, source, image });
  assert.deepEqual(full.artifact, repeated.artifact, 'Identical lossless RGB jobs must replay identical bytes.');
  const range = await renderIsolated({ request: { ...fullRequest, frameRange: [2, 4] }, source, image });
  const sound = await renderIsolated({ request: { ...fullRequest, audioTracks: [{ file: 'sound.wav' }] }, source, image });
  for (const [label, rendered, first, last, hasAudio] of [['full', full, 0, 5, false], ['range', range, 2, 4, false], ['audio', sound, 0, 5, true]]) {
    const actual = decode(rendered.artifact);
    const reference = Buffer.concat(expected.slice(first, last + 1));
    assert.equal(actual.length, reference.length);
    assert.deepEqual(actual, reference, `Every ${label} decoded channel sample must match PNG exactly.`);
    const output = `${directory}lossless-rgb-${label}.mp4`;
    await writeFile(output, rendered.artifact);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,codec_type,pix_fmt,color_range,color_space,width,height,nb_read_frames,r_frame_rate:format=duration', '-of', 'json', output], { encoding: 'utf8', timeout: 10_000, windowsHide: true }));
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'gbrp');
    assert.equal(video.color_range, 'pc'); assert.equal(video.color_space, 'gbr');
    assert.equal(video.width, 96); assert.equal(video.height, 64); assert.equal(video.r_frame_rate, '12/1');
    assert.equal(Number(video.nb_read_frames), last - first + 1);
    assert.ok(Math.abs(Number(probe.format.duration) - (last - first + 1) / 12) < .04);
    assert.equal(probe.streams.length, hasAudio ? 2 : 1);
    if (hasAudio) {
      assert.equal(probe.streams.find((stream) => stream.codec_type === 'audio').codec_name, 'aac');
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', output, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { maxBuffer: 1_000_000, timeout: 10_000, windowsHide: true });
      assert.ok(pcm.length >= 24000 * 4 && pcm.length < 26000 * 4);
      let squares = 0; for (let sample = 2000; sample < 22000; sample++) squares += pcm.readFloatLE(sample * 4) ** 2;
      assert.ok(Math.sqrt(squares / 20000) > .1, 'Muxed AAC must contain the requested tone, not just an empty stream.');
    }
    records.push({ test: `actual-lossless-rgb-${label}`, ...rendered.receipt, exactRgbSamples: actual.length, differingRgbSamples: 0, probe });
  }
  console.log('PASS exact RGB pixels across every frame, range continuity, deterministic replay and AAC mux without video re-encoding');
  return records;
}
