import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { renderIsolated } from './host.mjs';
import { qualifyAudioOnly } from './qualify-audio-only.mjs';
import { qualifyGif } from './qualify-gif.mjs';
import { qualifyProres } from './qualify-prores.mjs';
import { qualifyVideoEncoding } from './qualify-video-encoding.mjs';
import { qualifyFrameReadiness } from './qualify-frame-readiness.mjs';

const variant = process.env.CUT_CODE_IMAGE_VARIANT ?? 'qualification';
if (!['qualification', 'production-candidate'].includes(variant)) throw new Error('Unsupported qualification image variant.');
const image = execFileSync('docker', ['image', 'inspect', `creativesos-cut-code:${variant}`, '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
const directory = fileURLToPath(new URL(`./qualification-output/${variant === 'production-candidate' ? 'production-candidate/' : ''}`, import.meta.url));
await mkdir(directory, { recursive: true });
const request = { version: 1, mode: 'still', width: 320, height: 180, fps: 30, durationInFrames: 30, frame: 0, entrypoint: 'src/main.tsx', input: { title: 'CreativesOS' } };
const capsule = (code, extras = {}) => Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'src/main.tsx': strToU8(code), ...extras }));
const source = capsule(`import {FullFrame,Sequence,useFrame,useInputs,interpolate} from '@creativesos/cut';import Title from './title';export default function Scene(){const f=useFrame();const input=useInputs();return <FullFrame style={{background:f<15?'#ff0000':'#0000ff'}}><div style={{position:'absolute',left:interpolate(f,[0,29],[0,240]),top:70,width:40,height:40,background:'#00ff00'}}/><Sequence at={15} duration={15}><Title label={input.title}/></Sequence></FullFrame>}`, { 'src/title.tsx': strToU8(`import {useFrame} from '@creativesos/cut';export default ({label})=><span style={{position:'absolute',top:0,color:'white'}}>{label}: {useFrame()}</span>`) });
const pixel = (artifact, x = 300, y = 160) => [...execFileSync('ffmpeg', ['-v', 'error', '-f', 'image2pipe', '-i', 'pipe:0', '-vf', `format=rgba,crop=1:1:${x}:${y}`, '-f', 'rawvideo', 'pipe:1'], { input: artifact, maxBuffer: 8192, windowsHide: true })];
const records = [];
records.push(...await qualifyFrameReadiness({ image, directory }));
records.push(...await qualifyVideoEncoding({ image, directory }));
records.push(...await qualifyProres({ image, directory }));
records.push(...await qualifyGif({ image, directory }));
records.push(...await qualifyAudioOnly({ image, directory }));
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
const cssSource = capsule(`import {useLayoutEffect} from 'react';import {useFrame} from '@creativesos/cut';import './styles/theme.css';import a from './styles/a.module.css';import b from './styles/b.module.css';export default function Scene(){const f=useFrame();useLayoutEffect(()=>{void document.fonts.load('24px PrivateBrand').then(fonts=>{if(fonts.length!==1||fonts[0].status!=='loaded')throw Error('Private CSS font did not load');});},[]);return <><div className={a.box} style={{left:20+f*2,top:20}}/><div className={b.box} style={{left:130,top:20}}/><div className="private-image"/><div className="private-font">Private typography</div></>}`, {
  'src/styles/theme.css': strToU8('@import "palette.css"; @font-face {font-family:PrivateBrand;src:url(../../assets/brand.ttf) format("truetype");} body{background:var(--background)} .private-image{position:absolute;left:220px;top:20px;width:40px;height:40px;background:url(../../assets/brand.svg)} .private-font{position:absolute;left:20px;top:90px;font-family:PrivateBrand;font-size:24px;color:white} .escaped::after{content:"</SCRIPT><div>not markup</div>";}'),
  'src/styles/palette.css': strToU8(':root{--background:#000000}'),
  'src/styles/base.module.css': strToU8('.base{position:absolute;width:40px;height:40px}'),
  'src/styles/a.module.css': strToU8('.box{composes:base from "base.module.css";background:#00ff00}'),
  'src/styles/b.module.css': strToU8('.box{composes:base from "base.module.css";background:#0000ff}'),
  'assets/brand.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path fill="#ff00ff" d="M0 0h40v40H0z"/></svg>'),
  'assets/brand.ttf': await readFile(new URL('../../shared/assets/cut-fonts/NotoSans-Variable.ttf', import.meta.url)),
});
for (const frame of [0, 20]) {
  const rendered = await renderIsolated({ request: { ...request, frame }, source: cssSource, image });
  assert.deepEqual(pixel(rendered.artifact, 30 + frame * 2, 30), [0, 255, 0, 255], 'CSS module composition must keep frame-driven positioning.');
  assert.deepEqual(pixel(rendered.artifact, 140, 30), [0, 0, 255, 255], 'Identically named classes in different modules must not collide.');
  assert.deepEqual(pixel(rendered.artifact, 230, 30), [255, 0, 255, 255], 'Stylesheet image URLs must embed private assets.');
  assert.deepEqual(pixel(rendered.artifact), [0, 0, 0, 255], 'Nested stylesheet imports must apply before capture.');
  if (frame === 20) assert.deepEqual(pixel(rendered.artifact, 30, 30), [0, 0, 0, 255]);
  await writeFile(`${directory}private-css-${frame}.png`, rendered.artifact);
  records.push({ test: `private-css-modules-assets-frame-${frame}`, ...rendered.receipt });
}
const cssReplay = await renderIsolated({ request: { ...request, frame: 0 }, source: cssSource, image });
assert.equal(cssReplay.receipt.artifactSha256, records.find((item) => item.test === 'private-css-modules-assets-frame-0').artifactSha256, 'Imported stylesheet output must be reproducible.');
console.log('PASS actual private CSS imports/modules, scoped classes, font/image URLs, frame motion and replay');
const latePoster = await renderIsolated({ request: { ...request, width: 321, height: 181, durationInFrames: 108000, frame: 107999 }, source: capsule(`import {FullFrame,useFrame} from '@creativesos/cut';export default ()=> <FullFrame style={{background:useFrame()===107999?'#00ff00':'#ff0000'}}/>`), image });
assert.deepEqual(pixel(latePoster.artifact), [0, 255, 0, 255]);
await writeFile(`${directory}late-frame-poster.png`, latePoster.artifact);
const posterProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', `${directory}late-frame-poster.png`], { encoding: 'utf8', windowsHide: true }));
assert.deepEqual(posterProbe.streams[0], { width: 321, height: 181 });
records.push({ test: 'odd-sized-late-frame-poster', ...latePoster.receipt });
console.log('PASS odd-sized still at a late absolute frame without rendering the whole timeline');
const threeSource = capsule(`import {useRef,useMemo,useLayoutEffect} from 'react';import {Scene,PerspectiveCamera,BoxGeometry,PlaneGeometry,Mesh,MeshBasicMaterial} from 'three';import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';import {useFrame,useComposition,useInputs} from '@creativesos/cut';
export default function SceneView(){const frame=useFrame(),config=useComposition(),input=useInputs(),host=useRef(null);const view=useMemo(()=>{const scene=new Scene(),camera=new PerspectiveCamera(50,config.width/config.height,.1,100),renderer=new SVGRenderer();renderer.setSize(config.width,config.height);renderer.setPrecision(5);const back=new Mesh(new PlaneGeometry(20,20),new MeshBasicMaterial({color:'#0000ff'}));back.position.z=-1;scene.add(back);const box=new Mesh(new BoxGeometry(1.2,1.2,1.2),new MeshBasicMaterial({color:'#ff0000'}));scene.add(box);return {scene,camera,renderer,box,back};},[]);useLayoutEffect(()=>{view.camera.position.z=input.cameraZ??4;view.box.position.x=frame*1.3/20;view.box.rotation.y=frame/30;view.box.rotation.x=frame/100;view.renderer.render(view.scene,view.camera);host.current.replaceChildren(view.renderer.domElement);},[frame,input.cameraZ]);return <div ref={host}/>;}`);
const threeFrames = [];
for (const [name, frame, cameraZ] of [['near',0,4],['moving',20,4],['far',0,6]]) {
  const rendered = await renderIsolated({ request: { ...request, frame, input: { cameraZ } }, source: threeSource, image });
  await writeFile(`${directory}three-${name}.png`, rendered.artifact);
  threeFrames.push(rendered);
  records.push({ test: `private-three-vector-${name}`, ...rendered.receipt });
}
assert.deepEqual(pixel(threeFrames[0].artifact,160,90),[255,0,0,255]);
assert.deepEqual(pixel(threeFrames[1].artifact,160,90),[0,0,255,255]);
assert.deepEqual(pixel(threeFrames[1].artifact,220,90),[255,0,0,255]);
const redArea = artifact => {const decoded=execFileSync('ffmpeg',['-v','error','-i','pipe:0','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:artifact,maxBuffer:2_000_000,windowsHide:true});let area=0;for(let i=0;i<decoded.length;i+=4)if(decoded[i]>240&&decoded[i+1]<15&&decoded[i+2]<15)area++;return area;};
assert.ok(redArea(threeFrames[0].artifact)>1000);
assert.ok(redArea(threeFrames[2].artifact)<redArea(threeFrames[0].artifact)*.6,'A farther perspective camera must reduce the projected geometry area');
console.log('PASS actual pinned Three geometry, depth ordering, frame motion and perspective camera pixels');
const threeVideo = await renderIsolated({ request: { ...request, mode: 'video', frameRange: [0, 5], input: { cameraZ: 4 } }, source: threeSource, image });
const threeVideoPath = `${directory}three-motion.mp4`;
await writeFile(threeVideoPath, threeVideo.artifact);
const threeProbe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=nb_frames,width,height','-of','json',threeVideoPath], { encoding:'utf8',windowsHide:true }));
assert.equal(Number(threeProbe.streams[0].nb_frames),6);
const centroids = [0,5].map(frame => {const raw=execFileSync('ffmpeg',['-v','error','-i',threeVideoPath,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:2_000_000,windowsHide:true});let total=0,area=0;for(let i=0;i<raw.length;i+=3)if(raw[i]>220&&raw[i+1]<30&&raw[i+2]<30){total+=(i/3)%320;area++;}assert.ok(area>1000);return total/area;});
assert.ok(centroids[1]-centroids[0]>10,'Encoded Three video must advance actual geometry between frames');
records.push({ test:'private-three-motion-video',...threeVideo.receipt,probe:threeProbe });
console.log('PASS actual six-frame Three video with decoded geometry movement');
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
const fittedSpringSource = capsule(`import {FullFrame,useFrame,spring,measureSpring} from '@creativesos/cut';
export default function Scene(){const f=useFrame(),options={frame:f,fps:30,damping:20,durationInFrames:20,delay:5,from:20,to:220};
return <FullFrame style={{background:'#000000'}}><div style={{position:'absolute',left:spring(options),top:20,width:20,height:20,background:'#00ff00'}}/><div style={{position:'absolute',left:spring({...options,reverse:true}),top:70,width:20,height:20,background:'#0000ff'}}/><div style={{position:'absolute',left:0,top:130,width:20,height:20,background:measureSpring({fps:30,damping:20})>0?'#ffffff':'#ff0000'}}/></FullFrame>}`);
for (const frame of [0, 5, 25, 29]) {
  const rendered = await renderIsolated({ request: { ...request, frame }, source: fittedSpringSource, image });
  const start = frame <= 5;
  assert.deepEqual(pixel(rendered.artifact, start ? 30 : 230, 30), [0,255,0,255]);
  assert.deepEqual(pixel(rendered.artifact, start ? 230 : 30, 80), [0,0,255,255]);
  assert.deepEqual(pixel(rendered.artifact, start ? 230 : 30, 30), [0,0,0,255]);
  assert.deepEqual(pixel(rendered.artifact, 10, 140), [255,255,255,255]);
  await writeFile(`${directory}fitted-spring-${frame}.png`, rendered.artifact);
  records.push({ test: 'duration-fitted-spring-delay-reverse', frame, ...rendered.receipt });
}
console.log('PASS actual duration-fitted spring, delayed/reversed endpoints and holding pixels');
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
const automatedRequest = { ...request, mode: 'video', audioTracks: [{ file: 'src/tone-440.wav', volume: .5, volumeKeyframes: [{ frame: 0, value: 0 }, { frame: 12, value: 1, interpolation: 'hold' }, { frame: 24, value: 0 }] }] };
const automated = await renderIsolated({ request: automatedRequest, source: soundSource, image });
const automatedPath = `${directory}code-audio-envelope.mp4`;
await writeFile(automatedPath, automated.artifact);
const fadeStart = rms(automatedPath, .03, .10), gainPlateau = rms(automatedPath, .45, .65), gainEnd = rms(automatedPath, .86, .96);
assert.ok(fadeStart > .001 && fadeStart < gainPlateau * .3 && gainPlateau > .03 && gainEnd < .001, 'Encoded private audio must contain the fade, held gain and mute.');
const automatedRange = await renderIsolated({ request: { ...automatedRequest, frameRange: [6, 26] }, source: soundSource, image });
const automatedRangePath = `${directory}code-audio-envelope-range.mp4`;
await writeFile(automatedRangePath, automatedRange.artifact);
assert.ok(Math.abs(rms(automatedRangePath, .05, .15) / rms(automatedPath, .25, .35) - 1) < .05, 'Encoded range must continue the same fade, without restarting it.');
assert.ok(rms(automatedRangePath, .64, .69) < .001, 'Ranged held mute must use the original track clock.');
records.push({ test: 'private-audio-gain-keyframes-and-range', ...automated.receipt, fadeStartRms: fadeStart, plateauRms: gainPlateau, mutedRms: gainEnd, rangeReceipt: automatedRange.receipt });
console.log('PASS actual encoded soundtrack fades, held gain, mute and range continuity');
for (const format of ['mp4', 'webm']) {
  const privateVideoPath = `${directory}private-audio-streams.${format}`;
  const codecs = format === 'mp4' ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'] : ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'];
  execFileSync('ffmpeg', ['-v','error','-y','-f','lavfi','-i','color=c=red:s=160x90:r=30:d=1','-i',`${directory}tone-440.wav`,'-i',`${directory}tone-660.wav`,'-map','0:v:0','-map','1:a:0','-map','2:a:0',...codecs,'-filter:a:1','volume=0.25','-threads','1','-t','1',privateVideoPath], { windowsHide:true, timeout:20_000 });
  const mediaSource = capsule(`import {FullFrame} from '@creativesos/cut';export default ()=> <FullFrame style={{background:'#0000ff'}}/>`, { [`src/voice.${format}`]: await readFile(privateVideoPath) });
  const mediaRequest = { ...request, mode:'video', audioTracks:[{ file:`src/voice.${format}`, audioStream:1, startFrame:3, endFrame:27, sourceStartSeconds:.1 }] };
  const mediaSound = await renderIsolated({ request:mediaRequest, source:mediaSource, image });
  const mediaSoundPath = `${directory}code-${format}-selected-audio.mp4`; await writeFile(mediaSoundPath,mediaSound.artifact);
  const selectedRms = rms(mediaSoundPath,.25,.45);
  assert.ok(selectedRms > .015 && selectedRms < .028, 'The quieter second audio stream must be selected, not the first or a mixture.');
  assert.ok(rms(mediaSoundPath,.01,.07) < .001 && rms(mediaSoundPath,.94,.99) < .001, 'Embedded audio must retain the explicit offset and end.');
  const sample = execFileSync('ffmpeg',['-v','error','-i',mediaSoundPath,'-ss','0.25','-t','0.2','-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'], { maxBuffer:100_000,windowsHide:true });
  const energy = frequency => { let real=0,imaginary=0;for(let index=0;index<sample.length/4;index++){const value=sample.readFloatLE(index*4),angle=2*Math.PI*frequency*index/48000;real+=value*Math.cos(angle);imaginary+=value*Math.sin(angle);}return Math.hypot(real,imaginary); };
  assert.ok(energy(660)>energy(440)*10,'The selected soundtrack must contain the second stream frequency.');
  records.push({ test:`private-${format}-selected-audio-stream`,...mediaSound.receipt,selectedRms });
  await assert.rejects(renderIsolated({ request:{...mediaRequest,audioTracks:[{file:`src/voice.${format}`,audioStream:2}]},source:mediaSource,image }), error => /\(audio_probe\)/.test(error.stderr));
}
await assert.rejects(renderIsolated({request:{...request,mode:'video',audioTracks:[{file:'src/clip.mp4'}]},source:videoSource,image}), error => /\(audio_probe\)/.test(error.stderr));
await assert.rejects(renderIsolated({request:{...request,mode:'video',audioTracks:[{file:'src/missing.wav'}]},source:capsule('while(true){};export default ()=>null;'),image}), error => /\(audio_probe\)/.test(error.stderr));
console.log('PASS actual private MP4/WebM audio selection, trim/offset and missing-stream rejection');
const alphaSource = capsule(`import {useFrame} from '@creativesos/cut';export default ()=> <><div style={{position:'absolute',left:20+20*useFrame(),top:20,width:40,height:40,background:'#00ff00'}}/><div style={{position:'absolute',left:220,top:20,width:40,height:40,background:'rgba(255,0,0,0.5)'}}/></>`, sounds);
const alphaRequest = { ...request, mode:'video', format:'webm', fps:10, durationInFrames:6 };
const alphaVideo = await renderIsolated({request:alphaRequest,source:alphaSource,image});
const alphaPath = `${directory}transparent-motion.webm`; await writeFile(alphaPath,alphaVideo.artifact);
const alphaProbe = JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,codec_name,width,height,nb_read_frames:stream_tags=alpha_mode','-of','json',alphaPath],{encoding:'utf8',windowsHide:true}));
assert.equal(alphaProbe.streams[0].codec_name,'vp9'); assert.equal(Number(alphaProbe.streams[0].nb_read_frames),6); assert.equal(alphaVideo.receipt.mediaType,'video/webm');
const alphaPixel = (file,frame,x,y) => {
  const bytes=execFileSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-vf',`select=eq(n\\,${frame}),format=rgba,crop=1:1:${x}:${y}`,'-frames:v','1','-f','rawvideo','pipe:1'],{maxBuffer:8192,windowsHide:true});
  assert.equal(bytes.length,4);return [...bytes];
};
assert.equal(alphaPixel(alphaPath,0,300,160)[3],0,'Background must remain transparent after VP9 encoding.');
const opaque=alphaPixel(alphaPath,0,30,30),partial=alphaPixel(alphaPath,0,230,30);
assert.ok(opaque[1]>235&&opaque[0]<20&&opaque[2]<20&&opaque[3]===255);
assert.ok(partial[0]>235&&Math.abs(partial[3]-128)<=3,'Semi-transparent authored pixels must retain their alpha.');
assert.equal(alphaPixel(alphaPath,4,30,30)[3],0); assert.ok(alphaPixel(alphaPath,4,110,30)[1]>235,'Actual transparent motion must advance to the later frame.');
execFileSync('ffmpeg',['-v','error','-y','-nostdin','-c:v','libvpx-vp9','-i',alphaPath,'-frames:v','1',`${directory}transparent-motion-frame-0.png`],{windowsHide:true});
const alphaWithSound=await renderIsolated({request:{...alphaRequest,audioTracks:[{file:'src/tone-440.wav',volume:.5}]},source:alphaSource,image});
assert.deepEqual((await renderIsolated({request:alphaRequest,source:alphaSource,image})).artifact,alphaVideo.artifact,'Transparent WebM must replay byte-for-byte.');
assert.deepEqual((await renderIsolated({request:{...alphaRequest,audioTracks:[{file:'src/tone-440.wav',volume:.5}]},source:alphaSource,image})).artifact,alphaWithSound.artifact,'Transparent WebM with Opus must replay byte-for-byte.');
const alphaSoundPath=`${directory}transparent-motion-with-audio.webm`;await writeFile(alphaSoundPath,alphaWithSound.artifact);
const alphaSoundProbe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name','-of','json',alphaSoundPath],{encoding:'utf8',windowsHide:true}));
assert.ok(alphaSoundProbe.streams.some(stream=>stream.codec_type==='audio'&&stream.codec_name==='opus'));assert.ok(rms(alphaSoundPath,.1,.4)>.03);assert.equal(alphaPixel(alphaSoundPath,0,300,160)[3],0,'Muxing Opus must not flatten video alpha.');
const reusedAlphaSource=capsule(`import {FullFrame,FrameVideo} from '@creativesos/cut';import overlay from './overlay.webm';export default ()=> <FullFrame style={{background:'#0000ff'}}><FrameVideo src={overlay} style={{width:'100%',height:'100%'}}/></FullFrame>`,{'src/overlay.webm':alphaVideo.artifact});
const reusedAlpha=await renderIsolated({request:{...request,fps:10,durationInFrames:6,frame:4},source:reusedAlphaSource,image});
assert.deepEqual(pixel(reusedAlpha.artifact),[0,0,255,255]);assert.ok(pixel(reusedAlpha.artifact,110,30)[1]>235);
const mixedAlpha=pixel(reusedAlpha.artifact,230,30);assert.ok(Math.abs(mixedAlpha[0]-128)<8&&mixedAlpha[1]<8&&Math.abs(mixedAlpha[2]-127)<8,'Reimported alpha must composite correctly over the next scene.');
await writeFile(`${directory}reused-transparent-overlay.png`,reusedAlpha.artifact);
records.push({test:'transparent-vp9-alpha-motion',...alphaVideo.receipt,probe:alphaProbe,opaquePixel:opaque,partialPixel:partial,audioReceipt:alphaWithSound.receipt,reuseReceipt:reusedAlpha.receipt});
console.log('PASS actual VP9 alpha, partial opacity, frame motion, Opus mux and private video-layer reuse');
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
