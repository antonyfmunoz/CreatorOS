import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyFractionalAudioLoop({ image, directory }) {
  const tone = Buffer.alloc(44 + 7200 * 2);
  tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
  tone.writeUInt32LE(16,16); tone.writeUInt16LE(1,20); tone.writeUInt16LE(1,22);
  tone.writeUInt32LE(48000,24); tone.writeUInt32LE(96000,28); tone.writeUInt16LE(2,32); tone.writeUInt16LE(16,34);
  tone.write('data',36); tone.writeUInt32LE(14400,40);
  for (let i = 0; i < 7200; i++) tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (i < 2400 ? 800 : 400) * i / 48000) * 8000), 44 + i * 2);
  const wav = `${directory}fractional-loop-tone.wav`, clip = `${directory}fractional-loop-source.mp4`;
  await writeFile(wav, tone);
  execFileSync('ffmpeg', ['-v','error','-nostdin','-y','-f','lavfi','-i','color=c=blue:s=128x72:r=20:d=0.15','-i',wav,'-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',clip], { windowsHide:true,timeout:10000 });
  const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,duration,nb_frames:format=duration','-of','json',clip],{encoding:'utf8',windowsHide:true,timeout:10000}));
  assert.equal(Number(probe.streams.find(stream => stream.codec_type === 'video').duration), .15);
  const decode = (file, filter = '') => execFileSync('ffmpeg', ['-v','error','-nostdin','-i',file,...(filter ? ['-af',filter] : []),'-ac','1','-ar','48000','-f','f32le','pipe:1'], { windowsHide:true,timeout:10000,maxBuffer:2000000 });
  const reference = decode(clip, 'aresample=48000:async=1:first_pts=0,apad,atrim=end_sample=7200');
  assert.equal(reference.length, 7200 * 4);
  const source = Buffer.from(zipSync({ 'package.json':strToU8('{"dependencies":{"react":"18.3.1"}}'),'main.tsx':strToU8(`import {FrameVideo,useFrame} from '@creativesos/cut';import clip from './clip.mp4';export default ()=> <FrameVideo src={clip} startFrom={1} repeat volume={useFrame()<10?.25:.75}/>;`),'clip.mp4':await readFile(clip) }));
  const base = { version:1,mode:'video',format:'mov',width:128,height:72,fps:30,durationInFrames:60,entrypoint:'main.tsx',input:{},compositionAudio:true };
  const records = [];
  for (const [label, frameRange] of [['full',[0,59]],['range',[7,26]]]) {
    const request = { ...base, frameRange };
    const rendered = await renderIsolated({ request, source, image });
    const file = `${directory}fractional-loop-${label}.mov`; await writeFile(file, rendered.artifact);
    const actual = decode(file), count = (frameRange[1] - frameRange[0] + 1) * 1600;
    assert.equal(actual.length, count * 4);
    let squared = 0, maxError = 0;
    for (let i = 0; i < count; i++) {
      const absolute = i + frameRange[0] * 1600, gain = Math.floor(absolute / 1600) < 10 ? .25 : .75;
      const wanted = reference.readFloatLE(((absolute + 1600) % 7200) * 4) * gain;
      const error = Math.abs(actual.readFloatLE(i * 4) - wanted);
      squared += error * error; maxError = Math.max(maxError, error);
    }
    const rmsError = Math.sqrt(squared / count);
    // Independently decoded source PCM, modular sample addressing and known
    // gains provide the oracle. No renderer-produced success metadata is used.
    assert.ok(rmsError < .00015 && maxError < .003, `Fractional loop phase/gain mismatch: RMS ${rmsError}, peak ${maxError}`);
    assert.equal(rendered.receipt.audioTrackCount, 1);
    assert.equal(rendered.receipt.compositionAudio.trackCount, 1);
    records.push({ test:`sample-exact-video-loop-${label}`, ...rendered.receipt, rmsError, maxError, sourceProbe:probe });
    if (label === 'range') assert.equal((await renderIsolated({ request, source, image })).receipt.artifactSha256, rendered.receipt.artifactSha256);
  }
  const ntscFile = `${directory}fractional-loop-ntsc.mp4`;
  execFileSync('ffmpeg', ['-v','error','-nostdin','-y','-f','lavfi','-i','color=c=blue:s=128x72:r=30000/1001:d=0.1001','-f','lavfi','-i','sine=frequency=400:sample_rate=48000:duration=0.1001','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',ntscFile], { windowsHide:true,timeout:10000 });
  const ntscSource = Buffer.from(zipSync({ 'package.json':strToU8('{"dependencies":{"react":"18.3.1"}}'),'main.tsx':strToU8(`import {FrameVideo} from '@creativesos/cut';import clip from './clip.mp4';export default ()=> <FrameVideo src={clip} startFrom={1} repeat volume={.75}/>;`),'clip.mp4':await readFile(ntscFile) }));
  const ntsc = await renderIsolated({ request:base,source:ntscSource,image });
  const ntscOutput = `${directory}fractional-loop-ntsc.mov`; await writeFile(ntscOutput,ntsc.artifact);
  const ntscPcm = decode(ntscOutput);
  assert.equal(ntscPcm.length,96000*4);
  // Five .1001-second source cycles equal exactly 24024 output samples, not
  // five independently rounded periods. Check stationarity after startup,
  // and require real signal so silent output cannot pass the drift check.
  let driftSquared=0,signalSquared=0,driftPeak=0;
  for(let i=24000;i<48000;i++) {
    const value=ntscPcm.readFloatLE(i*4), difference=Math.abs(value-ntscPcm.readFloatLE((i+24024)*4));
    signalSquared+=value*value;driftSquared+=difference*difference;driftPeak=Math.max(driftPeak,difference);
  }
  const driftRms=Math.sqrt(driftSquared/24000),signalRms=Math.sqrt(signalSquared/24000);
  assert.ok(signalRms>.04&&driftRms<.00015&&driftPeak<.003,`NTSC loop drift or missing signal: RMS ${driftRms}, peak ${driftPeak}, signal ${signalRms}`);
  assert.equal(ntsc.receipt.compositionAudio.trackCount,1);
  records.push({test:'ntsc-video-loop-no-cumulative-sample-drift',...ntsc.receipt,driftRms,driftPeak,signalRms});
  console.log('PASS actual non-frame-aligned source loops: independent PCM phase, gain, range, repeated custody and one bounded interval');
  return records;
}
