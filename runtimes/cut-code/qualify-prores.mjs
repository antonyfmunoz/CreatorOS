import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyProres({ image, directory }) {
  const tone = Buffer.alloc(44 + 48000 * 2);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(48000, 24); tone.writeUInt32LE(96000, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
  tone.write('data', 36); tone.writeUInt32LE(96000, 40);
  for (let index = 0; index < 48000; index++) tone.writeInt16LE(Math.round(8000 * Math.sin(index * 2 * Math.PI * 440 / 48000)), 44 + index * 2);
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'tone.wav': tone, 'index.tsx': strToU8(`import {useFrame} from '@creativesos/cut';export default function Scene(){const f=useFrame();return <><div style={{position:'absolute',left:10+f*4,top:10,width:16,height:16,background:'#00ff00'}}/><div style={{position:'absolute',left:90,top:10,width:16,height:16,background:'rgba(255,0,255,.5)'}}/></>}`) }));
  const base = { version: 1, mode: 'video', format: 'mov', width: 128, height: 72, fps: 30, durationInFrames: 30, frameRange: [6, 11], entrypoint: 'index.tsx', input: {}, audioTracks: [{ file: 'tone.wav' }] };
  const records = [];
  let alpha;
  for (const [proresProfile, profile] of [['422hq', 'HQ'], ['4444', '4444'], ['4444xq', 'XQ']]) {
    const result = await renderIsolated({ request: { ...base, proresProfile }, source, image });
    const file = `${directory}prores-${proresProfile}.mov`;
    await writeFile(file, result.artifact);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,profile,width,height,pix_fmt,sample_rate,channels,nb_frames,duration:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
    assert.equal(probe.streams.length, 2);
    const video = probe.streams.find((stream) => stream.codec_type === 'video'), audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    assert.equal(video.codec_name, 'prores'); assert.equal(video.profile, profile);
    assert.equal(video.width, 128); assert.equal(video.height, 72); assert.equal(Number(video.nb_frames), 6);
    assert.ok(Math.abs(Number(probe.format.duration) - .2) < .001);
    assert.equal(audio.codec_name, 'pcm_s16le'); assert.equal(audio.sample_rate, '48000'); assert.equal(audio.channels, 2);
    const rgba = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-an', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { windowsHide: true, maxBuffer: 1_000_000, timeout: 10000 });
    assert.equal(rgba.length, 6 * 128 * 72 * 4);
    const pixel = (frame, x, y) => [...rgba.subarray(((frame * 72 + y) * 128 + x) * 4, ((frame * 72 + y) * 128 + x) * 4 + 4)];
    for (let frame = 0; frame < 6; frame++) {
      const marker = pixel(frame, 10 + (6 + frame) * 4 + 8, 18);
      assert.ok(marker[0] < 12 && marker[1] > 243 && marker[2] < 12 && marker[3] === 255, 'ProRes must encode the correct absolute frame motion and opaque color.');
      if (proresProfile !== '422hq') {
        assert.equal(pixel(frame, 120, 60)[3], 0);
        const translucent = pixel(frame, 98, 18);
        assert.ok(translucent[0] > 243 && translucent[2] > 243 && translucent[1] < 12 && Math.abs(translucent[3] - 128) <= 2, '4444 output must retain partial alpha, not flatten against a background.');
      } else assert.equal(pixel(frame, 120, 60)[3], 255);
    }
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, maxBuffer: 100_000, timeout: 10000 });
    assert.equal(pcm.length / 4, 9600);
    let energy = 0; for (let offset = 0; offset < pcm.length; offset += 4) energy += pcm.readFloatLE(offset) ** 2;
    const rms = Math.sqrt(energy / 9600); assert.ok(rms > .1 && rms < .25);
    assert.equal(result.receipt.audioTrackCount, 1); assert.equal(result.receipt.silent, false);
    if (proresProfile === '4444') alpha = result;
    records.push({ test: `prores-${proresProfile}-pixels-pcm-range`, ...result.receipt, probe, rms });
  }
  const replay = await renderIsolated({ request: { ...base, proresProfile: '4444' }, source, image });
  assert.equal(replay.receipt.artifactSha256, alpha.receipt.artifactSha256);
  const silent = await renderIsolated({ request: { ...base, proresProfile: '4444', audioTracks: [] }, source, image });
  assert.equal(silent.receipt.audioTrackCount, 0); assert.equal(silent.receipt.silent, true);
  await writeFile(`${directory}prores-4444-silent.mov`, silent.artifact);
  const silentProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', `${directory}prores-4444-silent.mov`], { encoding: 'utf8', windowsHide: true }));
  assert.deepEqual(silentProbe.streams, [{ codec_type: 'video' }]);
  records.push({ test: 'prores-alpha-replay-silent', ...silent.receipt });
  console.log('PASS actual ProRes HQ/4444/XQ profiles, opaque/partial-alpha pixels, frame range, PCM audio and byte replay');
  return records;
}
