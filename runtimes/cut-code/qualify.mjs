import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { renderIsolated } from './host.mjs';

const image = execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:qualification', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
const directory = fileURLToPath(new URL('./qualification-output/', import.meta.url));
await mkdir(directory, { recursive: true });
const request = { version: 1, mode: 'still', width: 320, height: 180, fps: 30, durationInFrames: 30, frame: 0, entrypoint: 'src/main.tsx', input: { title: 'CreativesOS' } };
const capsule = (code, extras = {}) => Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'src/main.tsx': strToU8(code), ...extras }));
const source = capsule(`import {FullFrame,Sequence,useFrame,useInputs,interpolate} from '@creativesos/cut';import Title from './title';export default function Scene(){const f=useFrame();const input=useInputs();return <FullFrame style={{background:f<15?'#ff0000':'#0000ff'}}><div style={{position:'absolute',left:interpolate(f,[0,29],[0,240]),top:70,width:40,height:40,background:'#00ff00'}}/><Sequence at={15} duration={15}><Title label={input.title}/></Sequence></FullFrame>}`, { 'src/title.tsx': strToU8(`import {useFrame} from '@creativesos/cut';export default ({label})=><span style={{position:'absolute',top:0,color:'white'}}>{label}: {useFrame()}</span>`) });
const pixel = (artifact, x = 300, y = 160) => [...execFileSync('ffmpeg', ['-v', 'error', '-f', 'image2pipe', '-i', 'pipe:0', '-vf', `format=rgba,crop=1:1:${x}:${y}`, '-f', 'rawvideo', 'pipe:1'], { input: artifact, maxBuffer: 8192, windowsHide: true })];
const records = [];
for (const frame of [0, 20]) {
  const rendered = await renderIsolated({ request: { ...request, frame }, source, image });
  assert.deepEqual(pixel(rendered.artifact), frame === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  assert.deepEqual(pixel(rendered.artifact, frame === 0 ? 20 : 185, 90), [0, 255, 0, 255], 'Frame-driven position interpolation must move the visible marker.');
  await writeFile(`${directory}frame-${frame}.png`, rendered.artifact);
  records.push({ test: `frame-${frame}`, ...rendered.receipt, isolation: rendered.isolation });
  console.log(`PASS actual TSX frame ${frame}, private relative import, frame SDK and pixel verification`);
}
const video = await renderIsolated({ request: { ...request, mode: 'video' }, source, image });
const videoPath = `${directory}motion.mp4`;
await writeFile(videoPath, video.artifact);
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_frames,duration', '-of', 'json', videoPath], { encoding: 'utf8', windowsHide: true }));
assert.equal(probe.streams.length, 1);
assert.deepEqual({ width: probe.streams[0].width, height: probe.streams[0].height, frames: Number(probe.streams[0].nb_frames) }, { width: 320, height: 180, frames: 30 });
records.push({ test: 'video', ...video.receipt, probe });
console.log('PASS actual 30-frame H.264 motion video');
for (const format of ['jpeg', 'webp']) {
  const result = await renderIsolated({ request: { ...request, format, quality: 95 }, source, image });
  const decoded = pixel(result.artifact);
  assert.ok(decoded[0] >= 240 && decoded[1] <= 15 && decoded[2] <= 15 && decoded[3] === 255, 'Compressed still must retain the expected red output.');
  assert.equal(result.receipt.mediaType, `image/${format}`);
  await writeFile(`${directory}frame-0.${format}`, result.artifact);
  records.push({ test: `direct-${format}-still`, ...result.receipt });
}
console.log('PASS directly decoded JPEG and WebP composition stills');
const ranged = await renderIsolated({ request: { ...request, mode: 'video', frameRange: [12, 17] }, source, image });
const rangedPath = `${directory}range-12-17.mp4`;
await writeFile(rangedPath, ranged.artifact);
const rangedProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=nb_frames,duration', '-of', 'json', rangedPath], { encoding: 'utf8', windowsHide: true }));
assert.equal(Number(rangedProbe.streams[0].nb_frames), 6);
for (const [frame, channel] of [[0, 0], [5, 2]]) {
  const still = execFileSync('ffmpeg', ['-v', 'error', '-i', rangedPath, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { maxBuffer: 1024 * 1024, windowsHide: true });
  assert.ok(pixel(still)[channel] > 240, 'Ranged video must preserve absolute composition timing.');
}
records.push({ test: 'inclusive-video-frame-range', ...ranged.receipt, probe: rangedProbe });
console.log('PASS exact six-frame video range with absolute timeline pixels');
const sequenceRequest = { ...request, mode: 'sequence', frameRange: [12, 17] };
const sequence = await renderIsolated({ request: sequenceRequest, source, image });
const files = unzipSync(sequence.artifact);
const manifest = JSON.parse(strFromU8(files['manifest.json']));
assert.deepEqual(manifest.frames.map((item) => item.frame), [12, 13, 14, 15, 16, 17]);
assert.equal(manifest.requestSha256, sequence.receipt.requestSha256);
assert.equal(Object.keys(files).length, 7);
for (const item of manifest.frames) {
  const bytes = Buffer.from(files[item.filename]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  assert.equal(bytes.length, item.bytes);
  assert.deepEqual(pixel(bytes), item.frame < 15 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
}
const sequenceReplay = await renderIsolated({ request: sequenceRequest, source, image });
assert.equal(sequenceReplay.receipt.artifactSha256, sequence.receipt.artifactSha256, 'The same frame-driven request must produce an identical PNG sequence archive.');
await writeFile(`${directory}sequence-12-17.zip`, sequence.artifact);
records.push({ test: 'hashed-reproducible-png-sequence', ...sequence.receipt });
console.log('PASS decoded image sequence, manifest hashes and byte-identical replay');
const transparent = await renderIsolated({ request: { ...request, input: { color: '#ff00ff' } }, source: capsule(`import {useInputs} from '@creativesos/cut';export default function Scene(){const input=useInputs();return <div style={{width:100,height:100,background:input.color}}/>}`), image });
assert.deepEqual(pixel(transparent.artifact), [0, 0, 0, 0]);
assert.deepEqual(pixel(transparent.artifact, 20, 20), [255, 0, 255, 255]);
records.push({ test: 'transparent-png-and-input-binding', ...transparent.receipt });
console.log('PASS direct transparent composition PNG and input-bound output');
const latePoster = await renderIsolated({ request: { ...request, width: 321, height: 181, durationInFrames: 108000, frame: 107999 }, source: capsule(`import {FullFrame,useFrame} from '@creativesos/cut';export default ()=> <FullFrame style={{background:useFrame()===107999?'#00ff00':'#ff0000'}}/>`), image });
assert.deepEqual(pixel(latePoster.artifact), [0, 255, 0, 255]);
await writeFile(`${directory}late-frame-poster.png`, latePoster.artifact);
const posterProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', `${directory}late-frame-poster.png`], { encoding: 'utf8', windowsHide: true }));
assert.deepEqual(posterProbe.streams[0], { width: 321, height: 181 });
records.push({ test: 'odd-sized-late-frame-poster', ...latePoster.receipt });
console.log('PASS odd-sized still at a late absolute frame without rendering the whole timeline');
const motionSource = capsule(`import {FullFrame,Sequence,Repeat,Freeze,useFrame,useGlobalFrame,interpolate,easing,spring,interpolateColor,seededRandom} from '@creativesos/cut';
function Probe(){const local=useFrame(),global=useGlobalFrame();return <div style={{position:'absolute',left:0,top:0,width:40,height:40,background:local===4&&global===20?'#00ff00':'#ff0000'}}/>;}
function Frozen(){return <div style={{position:'absolute',left:40,top:0,width:40,height:40,background:useFrame()===7&&useGlobalFrame()===20?'#00ff00':'#ff0000'}}/>;}
export default function Scene(){const f=useFrame();return <FullFrame style={{background:interpolateColor(f,[0,40],['#ff0000','#0000ff'])}}>
<Sequence at={5}><Repeat duration={10} count={3} alternate><Probe/></Repeat><Freeze frame={7}><Frozen/></Freeze></Sequence>
<div style={{position:'absolute',left:interpolate(f,[0,40],[0,240],{ease:easing.bezier(.42,0,.58,1)}),top:70,width:40,height:40,background:'#00ff00'}}/>
<div style={{position:'absolute',left:280,top:0,width:40,height:40,background:spring({frame:f,fps:30,damping:20})>.98&&seededRandom('same')===seededRandom('same')?'#00ff00':'#ff0000'}}/>
</FullFrame>}`);
const motion = await renderIsolated({ request: { ...request, frame: 20, durationInFrames: 41 }, source: motionSource, image });
assert.deepEqual(pixel(motion.artifact), [128, 0, 128, 255]);
for (const [x, y] of [[20, 20], [60, 20], [140, 90], [300, 20]]) assert.deepEqual(pixel(motion.artifact, x, y), [0, 255, 0, 255]);
await writeFile(`${directory}motion-controls.png`, motion.artifact);
records.push({ test: 'nested-repeat-freeze-global-frame-bezier-spring-color', ...motion.receipt });
console.log('PASS actual nested timing, global frame, easing, spring and color output');
await assert.rejects(renderIsolated({ request, source: capsule(`import {useEffect} from 'react';export default function Scene(){useEffect(()=>{throw new Error('private source must not be logged')},[]);return <div/>}`), image }));
records.push({ test: 'react-effect-failure-is-not-success', passed: true });
console.log('PASS asynchronous composition failure rejects artifact completion');
const clipPath = `${directory}private-video-fixture.mp4`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=10:d=0.3', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=10:d=0.3', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clipPath], { windowsHide: true });
const clip = await readFile(clipPath);
const videoSource = capsule(`import {FrameVideo,FullFrame} from '@creativesos/cut';import clip from './clip.mp4';export default ()=> <FullFrame><FrameVideo src={clip} style={{width:'100%',height:'100%'}}/></FullFrame>`, { 'src/clip.mp4': clip });
for (const frame of [1, 4]) {
  const result = await renderIsolated({ request: { ...request, fps: 10, durationInFrames: 6, frame }, source: videoSource, image });
  await writeFile(`${directory}video-seek-${frame}.png`, result.artifact);
  const decodedPixel = pixel(result.artifact);
  assert.ok(decodedPixel[frame < 3 ? 0 : 2] > 240, `Private video must seek to frame ${frame}; decoded pixel ${decodedPixel.join(',')}.`);
  records.push({ test: `private-video-seek-${frame}`, ...result.receipt });
}
const encodedClip = await renderIsolated({ request: { ...request, fps: 10, durationInFrames: 6, mode: 'video' }, source: videoSource, image });
await writeFile(`${directory}code-video-layer.mp4`, encodedClip.artifact);
const layerProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=nb_frames,codec_type', '-of', 'json', `${directory}code-video-layer.mp4`], { encoding: 'utf8', windowsHide: true }));
assert.equal(layerProbe.streams.length, 1);
assert.equal(Number(layerProbe.streams[0].nb_frames), 6);
records.push({ test: 'private-video-layer-render', ...encodedClip.receipt, probe: layerProbe });
const retimedSource = capsule(`import {FrameVideo,FullFrame} from '@creativesos/cut';import clip from './clip.mp4';export default ()=> <FullFrame><FrameVideo src={clip} startFrom={2} speed={2} repeat style={{width:'100%',height:'100%'}}/></FullFrame>`, { 'src/clip.mp4': clip });
for (const [frame, channel] of [[1, 2], [2, 0]]) {
  const retimed = await renderIsolated({ request: { ...request, fps: 10, durationInFrames: 6, frame }, source: retimedSource, image });
  assert.ok(pixel(retimed.artifact)[channel] > 240, 'Offset/speed/repeat must select the correct source frame.');
  records.push({ test: `retimed-private-video-${frame}`, ...retimed.receipt });
}
console.log('PASS capsule-local video seeking and six-frame code video render (silent)');
const sounds = {};
for (const frequency of [440, 660]) {
  const file = `${directory}tone-${frequency}.wav`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=1`, file], { windowsHide: true });
  sounds[`src/tone-${frequency}.wav`] = await readFile(file);
}
const soundSource = capsule(`import {FullFrame} from '@creativesos/cut';export default ()=> <FullFrame style={{background:'#0000ff'}}/>`, sounds);
const soundRequest = { ...request, mode: 'video', audioTracks: [
  { file: 'src/tone-440.wav', startFrame: 6, endFrame: 24, sourceStartSeconds: .1, volume: .5 },
  { file: 'src/tone-660.wav', startFrame: 12, endFrame: 18, volume: .4 },
] };
const sound = await renderIsolated({ request: soundRequest, source: soundSource, image });
const soundPath = `${directory}code-audio-mix.mp4`;
await writeFile(soundPath, sound.artifact);
const soundProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels,duration', '-of', 'json', soundPath], { encoding: 'utf8', windowsHide: true }));
assert.equal(soundProbe.streams.filter((stream) => stream.codec_type === 'audio').length, 1);
assert.equal(sound.receipt.audioTrackCount, 2); assert.equal(sound.receipt.silent, false);
const rms = (file, start, end) => {
  const samples = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-af', `atrim=start=${start}:end=${end}`, '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], { maxBuffer: 1024 * 1024, windowsHide: true });
  assert.ok(samples.length > 0);
  let sum = 0; for (let index = 0; index < samples.length; index += 4) sum += samples.readFloatLE(index) ** 2;
  return Math.sqrt(sum / (samples.length / 4));
};
assert.ok(rms(soundPath, .03, .12) < .001, 'Soundtrack must not start before its timeline offset.');
assert.ok(rms(soundPath, .88, .97) < .001, 'Soundtrack must stop at its exclusive end frame.');
const solo = rms(soundPath, .25, .35), mixed = rms(soundPath, .45, .55);
assert.ok(solo > .015 && mixed > solo * 1.15, 'Both independent private tracks must actually contribute to the mix.');
const soundRange = await renderIsolated({ request: { ...soundRequest, frameRange: [12, 20] }, source: soundSource, image });
const soundRangePath = `${directory}code-audio-range.mp4`; await writeFile(soundRangePath, soundRange.artifact);
assert.ok(rms(soundRangePath, .02, .12) > rms(soundRangePath, .24, .29) * 1.15, 'Ranged audio must retain original absolute track timing.');
records.push({ test: 'private-audio-mix-and-range', ...sound.receipt, probe: soundProbe, soloRms: solo, mixedRms: mixed, rangeReceipt: soundRange.receipt });
console.log('PASS actual private audio mixing, offset/trim/gain and ranged A/V timing');
const denied = capsule(`import {FullFrame} from '@creativesos/cut';let allBlocked=true;for(const url of ['http://169.254.169.254/computeMetadata/v1/','https://example.com/','file:///etc/passwd']){try{const xhr=new XMLHttpRequest();xhr.open('GET',url,false);xhr.send();if(xhr.status===200||xhr.responseText)allBlocked=false;}catch{}}export default ()=> <FullFrame style={{background:allBlocked?'#00ff00':'#ff0000'}}/>;`);
const boundary = await renderIsolated({ request, source: denied, image });
assert.deepEqual(pixel(boundary.artifact), [0, 255, 0, 255]);
records.push({ test: 'network-metadata-file-denied', ...boundary.receipt, isolation: boundary.isolation });
console.log('PASS external network, cloud metadata and local-file attempts denied');
await assert.rejects(renderIsolated({ request, source: capsule('while(true){};export default ()=>null;'), image, timeoutMs: 7000 }), (error) => error.code === 'CUT_RENDER_TIMEOUT');
console.log('PASS infinite-loop termination');
const abort = new AbortController();
const cancellation = setTimeout(() => abort.abort(), 7000);
try { await assert.rejects(renderIsolated({ request, source: capsule('while(true){};export default ()=>null;'), image, signal: abort.signal }), (error) => error.code === 'CUT_RENDER_CANCELLED'); }
finally { clearTimeout(cancellation); }
const remaining = execFileSync('docker', ['ps', '-a', '--filter', 'name=creativesos-cut-code-', '--format', '{{.Names}}'], { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(remaining, '', 'No code-render container may remain after cancellation.');
records.push({ test: 'deadline-cancellation-cleanup', passed: true });
await writeFile(`${directory}receipt.json`, JSON.stringify({ image, recordedAt: new Date().toISOString(), records }, null, 2));
console.log('PASS cancellation and container cleanup; qualification receipt recorded');
