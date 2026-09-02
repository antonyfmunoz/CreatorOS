import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

// Owned generated source and tone only. No user files, microphones or providers.
export async function qualifyFrameAudio({ image, directory }) {
  const tone = Buffer.alloc(44 + 48000 * 2 * 2);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(48000, 24); tone.writeUInt32LE(96000, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
  tone.write('data', 36); tone.writeUInt32LE(tone.length - 44, 40);
  for (let index = 0; index < 96000; index++) {
    const frequency = index < 14400 ? 440 : index < 28800 ? 880 : 1320;
    tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / 48000) * 8000), 44 + index * 2);
  }
  const capsule = (code) => Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'main.tsx': strToU8(code), 'sound.wav': tone }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const imports = `import {FullFrame,FrameAudio,Sequence,Repeat,Freeze,useFrame} from '@creativesos/cut';`;
  const source = capsule(`${imports}
function Voice(){const f=useFrame();return <FrameAudio file="sound.wav" startFrom={3} volume={f<6?.25:f<12?1:0}/>}
export default function Scene(){return <FullFrame style={{background:'#123456'}}>
<Sequence at={3} duration={18}><Voice/></Sequence>
<Sequence at={24} duration={6}><Repeat duration={3} count={2}><FrameAudio file="sound.wav" startFrom={30} speed={2}/></Repeat></Sequence>
<Sequence at={33} duration={3}><Freeze frame={3}><FrameAudio file="sound.wav"/></Freeze></Sequence>
<Sequence at={36} duration={6}><Repeat duration={3} count={2} alternate><FrameAudio file="sound.wav" startFrom={30}/></Repeat></Sequence>
</FullFrame>}`);
  const base = { version: 1, mode: 'video', format: 'mov', width: 128, height: 72, fps: 30, durationInFrames: 48, entrypoint: 'main.tsx', input: {}, compositionAudio: true,
    audioTracks: [{ file: 'sound.wav', startFrame: 42, endFrame: 48, volume: .1 }] };
  const decode = (file) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, maxBuffer: 2_000_000, timeout: 10_000 });
  const rms = (bytes, start, end) => {
    const first = Math.round(start * 48000), last = Math.round(end * 48000);
    assert.ok(last * 4 <= bytes.length && first < last);
    let sum = 0;
    for (let index = first; index < last; index++) sum += bytes.readFloatLE(index * 4) ** 2;
    return Math.sqrt(sum / (last - first));
  };
  const energy = (bytes, start, end, frequency) => {
    let real = 0, imaginary = 0;
    for (let index = Math.round(start * 48000); index < Math.round(end * 48000); index++) {
      real += bytes.readFloatLE(index * 4) * Math.cos(2 * Math.PI * frequency * index / 48000);
      imaginary += bytes.readFloatLE(index * 4) * Math.sin(2 * Math.PI * frequency * index / 48000);
    }
    return Math.hypot(real, imaginary);
  };
  const result = await renderIsolated({ request: base, source, image });
  const file = `${directory}frame-audio.mov`;
  await writeFile(file, result.artifact);
  const pcm = decode(file);
  assert.equal(pcm.length / 4, 76800);
  const quarter = rms(pcm, .14, .26), full = rms(pcm, .34, .46);
  assert.ok(full > .1 && Math.abs(quarter / full - .25) < .003, 'Frame-driven gain must survive actual PCM export.');
  for (const [start, end] of [[.02, .08], [.53, .67], [.72, .78], [1.11, 1.18], [1.32, 1.38]]) assert.ok(rms(pcm, start, end) < .0001, 'Unmounted, muted, frozen and reversed intervals must stay silent.');
  assert.ok(energy(pcm, .34, .46, 880) > energy(pcm, .34, .46, 440) * 100, 'Local source offset must select the later 880 Hz portion.');
  assert.ok(energy(pcm, .82, .88, 1320) > energy(pcm, .82, .88, 2640) * 100, 'Double-speed audio preserves pitch.');
  assert.ok(Math.abs(rms(pcm, .82, .88) / rms(pcm, .92, .98) - 1) < .01, 'A repeated scene restarts its soundtrack.');
  assert.ok(Math.abs(rms(pcm, 1.42, 1.56) / full - .1) < .005, 'Explicit soundtrack and composition audio share one mix.');
  assert.equal(result.receipt.audioTrackCount, 5);
  assert.equal(result.receipt.compositionAudio.trackCount, 4);
  const records = [{ test: 'frame-audio-lifecycle-pcm', ...result.receipt, quarterRms: quarter, fullRms: full }];
  for (const format of ['mov', 'mp4', 'webm']) {
    const request = { ...base, format, frameRange: [9, 20], audioTracks: [] };
    const ranged = await renderIsolated({ request, source, image });
    const rangeFile = `${directory}frame-audio-range.${format}`;
    await writeFile(rangeFile, ranged.artifact);
    const rangePcm = decode(rangeFile);
    assert.ok(Math.abs(rms(rangePcm, .04, .16) / full - 1) < .025, 'Trimmed exports must continue source and gain clocks.');
    assert.ok(rms(rangePcm, .24, .36) < .001, 'The range must preserve its later frame mute.');
    assert.equal(ranged.receipt.compositionAudio.trackCount, 1);
    if (format === 'mov') assert.equal((await renderIsolated({ request, source, image })).receipt.artifactSha256, ranged.receipt.artifactSha256);
    records.push({ test: `frame-audio-range-${format}`, ...ranged.receipt });
  }
  const silent = await renderIsolated({ request: { ...base, frameRange: [0, 2], audioTracks: [] }, source, image });
  assert.equal(silent.receipt.audioTrackCount, 0); assert.equal(silent.receipt.silent, true);
  const silentFile = `${directory}frame-audio-empty.mov`;
  await writeFile(silentFile, silent.artifact);
  const silentProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', silentFile], { encoding: 'utf8', windowsHide: true }));
  assert.deepEqual(silentProbe.streams.map((stream) => stream.codec_type), ['video']);
  // Exercise the maximum admitted sample count and the bounded graph-file path,
  // not just a few constant gains that collapse into a tiny expression.
  const longTone = Buffer.alloc(44 + 48000 * 10 * 2);
  tone.copy(longTone, 0, 0, 44);
  longTone.writeUInt32LE(longTone.length - 8, 4); longTone.writeUInt32LE(longTone.length - 44, 40);
  for (let index = 0; index < 480000; index++) longTone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * index / 48000) * 8000), 44 + index * 2);
  const maximumSource = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'),
    'main.tsx': strToU8(`${imports}export default function Scene(){return <FrameAudio file="long.wav" volume={(useFrame()%3)/2}/>}`), 'long.wav': longTone }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const maximum = await renderIsolated({ request: { ...base, width: 16, height: 16, fps: 60, durationInFrames: 600, audioTracks: [] }, source: maximumSource, image });
  const maximumFile = `${directory}frame-audio-600.mov`;
  await writeFile(maximumFile, maximum.artifact);
  const maximumPcm = decode(maximumFile);
  assert.equal(maximumPcm.length / 4, 480000);
  for (const frame of [0, 1, 2, 297, 298, 299, 597, 598, 599]) {
    const level = rms(maximumPcm, (frame + .2) / 60, (frame + .8) / 60);
    if (frame % 3 === 0) assert.ok(level < .0001, 'Maximum gain sequence retains exact muted frames.');
    else assert.ok(Math.abs(level / full - (frame % 3) / 2) < .04, 'All 600 frame gains decode at their actual frame boundaries.');
  }
  records.push({ test: 'frame-audio-600-samples-and-graph-file', ...maximum.receipt });
  const preparedSource = capsule(`import {useLayoutEffect,useState} from 'react';${imports}
import {holdFrame,releaseFrame} from '@creativesos/cut';
export default function Scene(){const f=useFrame();const [gain,setGain]=useState(0);
useLayoutEffect(()=>{const h=holdFrame();const timer=setTimeout(()=>{setGain(f<3?1:0);releaseFrame(h)},25);return ()=>{clearTimeout(timer);releaseFrame(h)}},[f]);
return <FrameAudio file="sound.wav" volume={gain}/>}`);
  const prepared = await renderIsolated({ request: { ...base, durationInFrames: 6, audioTracks: [] }, source: preparedSource, image });
  const preparedFile = `${directory}frame-audio-prepared.mov`;
  await writeFile(preparedFile, prepared.artifact);
  const preparedPcm = decode(preparedFile);
  assert.ok(rms(preparedPcm, .02, .08) > .1 && rms(preparedPcm, .12, .18) < .0001, 'Collect audio only after explicitly held React state has settled.');
  records.push({ test: 'frame-audio-preparation-state', ...prepared.receipt });
  const still = await renderIsolated({ request: { ...base, mode: 'still', format: 'png', compositionAudio: undefined, audioTracks: [], frame: 9 }, source, image });
  assert.equal(still.receipt.audioTrackCount, 0); assert.equal(still.receipt.mediaType, 'image/png');
  for (const body of [
    '<FrameAudio file="private-missing.wav" muted/>',
    '<FrameAudio file="../private.wav"/>',
    '<FrameAudio file="sound.wav" startFrom={59}/>',
    '<Repeat duration={1}><FrameAudio file="sound.wav"/></Repeat>',
    '<>{Array.from({length:9},(_,i)=><FrameAudio key={i} file="sound.wav"/>)}</>',
  ]) {
    await assert.rejects(renderIsolated({ request: { ...base, frameRange: [0, 8], audioTracks: [] }, source: capsule(`${imports}export default()=>${body};`), image }), (error) => {
      assert.notEqual(error.code, 'CUT_RENDER_TIMEOUT');
      assert.ok(/\((render|audio_probe)\)/.test(error.stderr));
      assert.ok(!error.stderr.includes('private-missing') && !error.stderr.includes('../private'));
      return true;
    });
  }
  await assert.rejects(renderIsolated({ request: { ...base, compositionAudio: undefined, frameRange: [3, 4], audioTracks: [] }, source, image }), /render/);
  console.log('PASS actual composition sound: local timing, 600 frame gains, mute, repeat, freeze, pitch, explicit mix, MOV/MP4/WebM ranges, replay, admission and redacted failures');
  return records;
}
