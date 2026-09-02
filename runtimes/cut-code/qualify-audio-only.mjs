import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

// Real encoded artifacts, independently probed and decoded on the host.
// A throwing visual entrypoint proves this mode does not execute capsule code.
export async function qualifyAudioOnly({ image, directory }) {
  const samples = 48000 * 2;
  const tone = Buffer.alloc(44 + samples * 2);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(48000, 24); tone.writeUInt32LE(96000, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
  tone.write('data', 36); tone.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 48000) * 8000), 44 + i * 2);
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'index.tsx': strToU8('throw new Error("Visual entrypoint must not execute for audio-only exports"); export default () => null;'), 'tone.wav': tone }));
  const request = { version: 1, mode: 'audio', width: 1920, height: 1080, fps: 30, durationInFrames: 60, entrypoint: 'index.tsx', input: {}, audioTracks: [{ file: 'tone.wav', volumeKeyframes: [{ frame: 0, value: 0, interpolation: 'hold' }, { frame: 15, value: 1 }, { frame: 45, value: 0 }] }] };
  const decode = (file) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, maxBuffer: 2_000_000, timeout: 10000 });
  const rms = (bytes, from, until) => {
    const first = Math.round(from * 48000), last = Math.round(until * 48000);
    assert.ok(last * 4 <= bytes.length);
    let sum = 0;
    for (let i = first; i < last; i++) sum += bytes.readFloatLE(i * 4) ** 2;
    return Math.sqrt(sum / (last - first));
  };
  const records = [];
  let fullPcm;
  for (const [format, codec] of [['wav', 'pcm_s16le'], ['mp3', 'mp3'], ['m4a', 'aac']]) {
    const result = await renderIsolated({ request: { ...request, format }, source, image });
    const file = `${directory}audio-only.${format}`;
    await writeFile(file, result.artifact);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels,duration:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
    assert.equal(probe.streams.length, 1, 'Audio exports must not carry a video stream.');
    assert.equal(probe.streams[0].codec_type, 'audio'); assert.equal(probe.streams[0].codec_name, codec);
    assert.equal(probe.streams[0].sample_rate, '48000'); assert.equal(probe.streams[0].channels, 2);
    // MP3 container duration includes encoder padding; its decoded gapless audio
    // is checked separately. AAC may decode a final padded packet (< 1024 samples).
    assert.ok(Math.abs(Number(probe.format.duration) - 2) < .05);
    const pcm = decode(file);
    assert.ok(pcm.length / 4 >= 96000 && pcm.length / 4 <= 97024);
    const before = rms(pcm, .1, .4), loud = rms(pcm, .6, .7), after = rms(pcm, 1.65, 1.9);
    assert.ok(before < .0001 && after < .0001 && loud > .07, 'Decoded audio must preserve the held start, audible fade and final mute.');
    assert.equal(result.receipt.audioTrackCount, 1); assert.equal(result.receipt.silent, false);
    if (format === 'wav') { fullPcm = pcm; assert.equal(pcm.length / 4, 96000); }
    records.push({ test: `audio-only-${format}`, ...result.receipt, probe, beforeRms: before, loudRms: loud, afterRms: after });
  }
  const ranged = await renderIsolated({ request: { ...request, format: 'wav', frameRange: [18, 47] }, source, image });
  const rangeFile = `${directory}audio-only-range.wav`;
  await writeFile(rangeFile, ranged.artifact);
  const rangePcm = decode(rangeFile);
  assert.equal(rangePcm.length / 4, 48000);
  assert.ok(Math.abs(rms(rangePcm, .1, .2) / rms(fullPcm, .7, .8) - 1) < .005, 'Ranged exports must continue the original automation clock.');
  const silence = await renderIsolated({ request: { ...request, durationInFrames: 108000, frameRange: [107970, 107999], audioTracks: [] }, source, image });
  const silenceFile = `${directory}audio-only-silence.wav`;
  await writeFile(silenceFile, silence.artifact);
  const silencePcm = decode(silenceFile);
  assert.equal(silencePcm.length / 4, 48000); assert.equal(rms(silencePcm, 0, 1), 0);
  assert.equal(silence.receipt.audioTrackCount, 0); assert.equal(silence.receipt.silent, true);
  const replay = await renderIsolated({ request: { ...request, format: 'wav', frameRange: [18, 47] }, source, image });
  assert.equal(replay.receipt.artifactSha256, ranged.receipt.artifactSha256);
  await assert.rejects(renderIsolated({ request: { ...request, audioTracks: [{ file: 'missing.wav' }] }, source, image }), /audio_probe/);
  await assert.rejects(renderIsolated({ request: { ...request, audioTracks: [{ file: 'tone.wav', sourceStartSeconds: 1 }] }, source, image }), /audio_probe/);
  records.push({ test: 'audio-only-range-silence-replay-admission', ...ranged.receipt, silenceReceipt: silence.receipt });
  console.log('PASS actual WAV/MP3/AAC audio-only exports, decoded gain, range timing, silence, replay and no visual execution');
  return records;
}
