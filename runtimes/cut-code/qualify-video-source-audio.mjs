import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyVideoSourceAudio({ image, directory }) {
  const tone = Buffer.alloc(44 + 96000 * 2);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(48000, 24); tone.writeUInt32LE(96000, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
  tone.write('data', 36); tone.writeUInt32LE(tone.length - 44, 40);
  for (let index = 0; index < 96000; index++) {
    const frequency = index < 14400 ? 440 : index < 28800 ? 880 : 1320;
    tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / 48000) * 8000), 44 + index * 2);
  }
  const toneFile = `${directory}source-video-tone.wav`, clipFile = `${directory}source-video-clip.mp4`;
  await writeFile(toneFile, tone);
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=128x72:r=30:d=2', '-i', toneFile, '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', clipFile], { windowsHide: true, timeout: 10_000 });
  const clip = await readFile(clipFile);
  const imports = `import {FullFrame,FrameVideo,Sequence,Repeat,Freeze,useFrame} from '@creativesos/cut';import clip from './clip.mp4';`;
  const capsule = (code, video = clip) => Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'main.tsx': strToU8(`${imports}${code}`), 'clip.mp4': video, 'sound.wav': tone }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const source = capsule(`function Voice(){const f=useFrame();return <FrameVideo src={clip} startFrom={3} volume={f<6?.25:1} muted={f>=12}/>}
export default ()=> <FullFrame><Sequence at={3} duration={18}><Voice/></Sequence>
<Sequence at={24} duration={6}><FrameVideo src={clip} startFrom={57} repeat/></Sequence>
<Sequence at={33} duration={3}><Freeze frame={3}><FrameVideo src={clip}/></Freeze></Sequence>
<Sequence at={36} duration={6}><Repeat duration={3} count={2} alternate><FrameVideo src={clip} startFrom={30}/></Repeat></Sequence></FullFrame>`);
  const base = { version: 1, mode: 'video', format: 'mov', width: 128, height: 72, fps: 30, durationInFrames: 48, entrypoint: 'main.tsx', input: {}, compositionAudio: true, audioTracks: [{ file: 'sound.wav', startFrame: 42, endFrame: 48, volume: .1 }] };
  const decode = (file) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { windowsHide: true, maxBuffer: 2_000_000, timeout: 10_000 });
  const rms = (bytes, start, end) => {
    const first = Math.round(start * 48000), last = Math.round(end * 48000);
    assert.ok(first < last && last * 4 <= bytes.length);
    let sum = 0; for (let index = first; index < last; index++) sum += bytes.readFloatLE(index * 4) ** 2;
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
  const file = `${directory}video-source-audio.mov`; await writeFile(file, result.artifact);
  const pcm = decode(file);
  assert.equal(pcm.length / 4, 76800);
  const quarter = rms(pcm, .14, .26), full = rms(pcm, .34, .46);
  assert.ok(full > .1 && Math.abs(quarter / full - .25) < .01);
  for (const [start, end] of [[.02, .08], [.54, .67], [.72, .78], [1.11, 1.18], [1.32, 1.38]]) assert.ok(rms(pcm, start, end) < .0001, 'Unmounted, muted, frozen and backward video clocks must not emit sound.');
  assert.ok(energy(pcm, .34, .46, 880) > energy(pcm, .34, .46, 440) * 50, 'Video source offset selects its actual later sound.');
  assert.ok(energy(pcm, .82, .88, 1320) > energy(pcm, .82, .88, 440) * 50);
  assert.ok(energy(pcm, .92, .98, 440) > energy(pcm, .92, .98, 1320) * 50, 'Repeating video restarts its source sound.');
  assert.ok(Math.abs(rms(pcm, 1.42, 1.56) / full - .1) < .01);
  // Source repeat now remains one continuous bounded loop interval, rather
  // than creating a new decode/mix interval at every source cycle.
  assert.equal(result.receipt.compositionAudio.trackCount, 3); assert.equal(result.receipt.audioTrackCount, 4);
  const records = [{ test: 'video-source-audio-lifecycle-pcm', ...result.receipt, quarterRms: quarter, fullRms: full }];
  for (const format of ['mov', 'mp4', 'webm']) {
    const request = { ...base, format, frameRange: [9, 20], audioTracks: [] };
    const ranged = await renderIsolated({ request, source, image });
    const rangeFile = `${directory}video-source-audio-range.${format}`; await writeFile(rangeFile, ranged.artifact);
    const audio = decode(rangeFile);
    assert.ok(Math.abs(rms(audio, .04, .16) / full - 1) < .03);
    assert.ok(rms(audio, .24, .36) < .001);
    if (format === 'mov') assert.equal((await renderIsolated({ request, source, image })).receipt.artifactSha256, ranged.receipt.artifactSha256);
    records.push({ test: `video-source-audio-range-${format}`, ...ranged.receipt });
  }
  const fast = await renderIsolated({ request: { ...base, durationInFrames: 9, audioTracks: [] }, source: capsule('export default ()=> <FrameVideo src={clip} startFrom={9} speed={2}/>'), image });
  const fastFile = `${directory}video-source-audio-speed.mov`; await writeFile(fastFile, fast.artifact);
  const fastPcm = decode(fastFile);
  assert.ok(energy(fastPcm, .04, .12, 880) > energy(fastPcm, .04, .12, 1760) * 50, 'Retimed source sound preserves pitch.');
  records.push({ test: 'video-source-audio-pitch-preserving-speed', ...fast.receipt });
  const shortFile = `${directory}source-video-short-audio.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', clipFile, '-c:v', 'copy', '-af', 'atrim=duration=0.05', '-c:a', 'aac', '-b:a', '192k', shortFile], { windowsHide: true, timeout: 10_000 });
  const short = await renderIsolated({ request: { ...base, durationInFrames: 6, audioTracks: [] }, source: capsule('export default ()=> <FrameVideo src={clip}/>', await readFile(shortFile)), image });
  const shortOutput = `${directory}video-source-audio-fractional-tail.mov`; await writeFile(shortOutput, short.artifact);
  const shortPcm = decode(shortOutput);
  assert.equal(shortPcm.length / 4, 9600);
  assert.ok(rms(shortPcm, .01, .04) > .05, 'The short source must actually contribute sound.');
  assert.ok(rms(shortPcm, .055, .19) < .0001, 'A fractional source EOF must pad silence, not replay or extend its final sound.');
  assert.equal(short.receipt.compositionAudio.trackCount, 1);
  records.push({ test: 'video-source-audio-fractional-source-tail', ...short.receipt });
  const selectedFile = `${directory}source-video-two-streams.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', clipFile, '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=2', '-map', '0:v:0', '-map', '0:a:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', selectedFile], { windowsHide: true, timeout: 10_000 });
  const selected = await renderIsolated({ request: { ...base, durationInFrames: 9, audioTracks: [] }, source: capsule('export default ()=> <FrameVideo src={clip} audioStream={1}/>', await readFile(selectedFile)), image });
  const selectedOutput = `${directory}video-source-audio-selected-stream.mov`; await writeFile(selectedOutput, selected.artifact);
  const selectedPcm = decode(selectedOutput);
  assert.ok(energy(selectedPcm, .05, .25, 660) > energy(selectedPcm, .05, .25, 440) * 50, 'Automatic source audio must select the requested stream, not its first stream.');
  records.push({ test: 'video-source-audio-selected-stream', ...selected.receipt });
  const offsetFile = `${directory}source-video-late-audio.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=128x72:r=30:d=1', '-itsoffset', '0.25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.5', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-threads:v', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', offsetFile], { windowsHide: true, timeout: 10_000 });
  const offsetProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration:format=start_time,duration', '-of', 'json', offsetFile], { windowsHide: true, encoding: 'utf8', timeout: 10_000 }));
  assert.ok(Number(offsetProbe.streams.find(stream => stream.codec_type === 'audio').start_time) > .2);
  const offsetSource = capsule('export default ()=> <FrameVideo src={clip}/>', await readFile(offsetFile));
  const offsetRequest = { ...base, durationInFrames: 30, audioTracks: [] };
  const offset = await renderIsolated({ request: offsetRequest, source: offsetSource, image });
  const offsetOutput = `${directory}video-source-audio-container-onset.mov`; await writeFile(offsetOutput, offset.artifact);
  const offsetPcm = decode(offsetOutput);
  assert.ok(rms(offsetPcm, .03, .18) < .001, 'Late source audio must retain its initial silence.');
  assert.ok(rms(offsetPcm, .32, .45) > .04 && rms(offsetPcm, .60, .69) > .04, 'Late source audio must retain its full later content.');
  assert.ok(rms(offsetPcm, .80, .95) < .001, 'Source sound must not extend past its timestamped endpoint.');
  records.push({ test: 'video-source-audio-container-onset-and-end', ...offset.receipt, probe: offsetProbe });
  const offsetRange = await renderIsolated({ request: { ...offsetRequest, frameRange: [9, 20] }, source: offsetSource, image });
  const offsetRangeFile = `${directory}video-source-audio-container-range.mov`; await writeFile(offsetRangeFile, offsetRange.artifact);
  const offsetRangePcm = decode(offsetRangeFile);
  assert.ok(rms(offsetRangePcm, .03, .35) > .04);
  records.push({ test: 'video-source-audio-container-range', ...offsetRange.receipt });
  const offsetFast = await renderIsolated({ request: { ...offsetRequest, durationInFrames: 15 }, source: capsule('export default ()=> <FrameVideo src={clip} speed={2}/>', await readFile(offsetFile)), image });
  const offsetFastFile = `${directory}video-source-audio-container-speed.mov`; await writeFile(offsetFastFile, offsetFast.artifact);
  const offsetFastPcm = decode(offsetFastFile);
  assert.ok(rms(offsetFastPcm, .02, .08) < .001 && rms(offsetFastPcm, .16, .29) > .04 && rms(offsetFastPcm, .42, .48) < .001);
  records.push({ test: 'video-source-audio-container-retiming', ...offsetFast.receipt });
  const shiftedFile = `${directory}source-video-nonzero-origin.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', offsetFile, '-c', 'copy', '-output_ts_offset', '5', shiftedFile], { windowsHide: true, timeout: 10_000 });
  const shiftedProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration:format=start_time,duration', '-of', 'json', shiftedFile], { encoding: 'utf8', windowsHide: true, timeout: 10_000 }));
  assert.equal(Number(shiftedProbe.format.start_time), 5);
  const shifted = await renderIsolated({ request: { ...offsetRequest, durationInFrames: 60 }, source: capsule('export default ()=> <FrameVideo src={clip} repeat/>', await readFile(shiftedFile)), image });
  const shiftedOutput = `${directory}video-source-audio-nonzero-origin-loop.mov`; await writeFile(shiftedOutput, shifted.artifact);
  const shiftedPcm = decode(shiftedOutput);
  for (const start of [0, 1]) {
    assert.ok(rms(shiftedPcm, start + .03, start + .18) < .001);
    assert.ok(rms(shiftedPcm, start + .32, start + .45) > .04 && rms(shiftedPcm, start + .60, start + .69) > .04);
    assert.ok(rms(shiftedPcm, start + .80, start + .95) < .001);
  }
  records.push({ test: 'video-source-audio-nonzero-origin-repeat', ...shifted.receipt, probe: shiftedProbe });
  const silentFile = `${directory}source-video-silent.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', clipFile, '-c:v', 'copy', '-an', silentFile], { windowsHide: true, timeout: 10_000 });
  for (const [name, code, video, enabled] of [['muted', 'export default ()=> <FrameVideo src={clip} muted/>', clip, true], ['no-audio-stream', 'export default ()=> <FrameVideo src={clip}/>', await readFile(silentFile), true], ['legacy-opt-out', 'export default ()=> <FrameVideo src={clip}/>', clip, undefined]]) {
    const silent = await renderIsolated({ request: { ...base, durationInFrames: 3, audioTracks: [], compositionAudio: enabled }, source: capsule(code, video), image });
    assert.equal(silent.receipt.audioTrackCount, 0);
    records.push({ test: `video-source-audio-${name}`, ...silent.receipt });
  }
  for (const code of ['export default ()=> <FrameVideo src={clip} speed={3}/>', 'export default ()=> <FrameVideo src={clip} audioStream={7}/>', 'export default ()=> <FrameVideo src={clip} speed={.4} repeat/>']) {
    await assert.rejects(renderIsolated({ request: { ...base, durationInFrames: 3, audioTracks: [] }, source: capsule(code), image }), (error) => /\(render\)/.test(String(error.stderr ?? error.message)) && error.code !== 'CUT_RENDER_TIMEOUT');
  }
  console.log('PASS imported source sound: private binding, local trim/gain/mute, repeat, freeze, reverse silence, pitch, ranges, explicit mix and silent-video/legacy behavior');
  return records;
}
