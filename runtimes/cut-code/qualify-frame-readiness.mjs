import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyFrameReadiness({ image, directory }) {
  const capsule = (code) => Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'src/main.tsx': strToU8(code) }));
  const request = { version: 1, mode: 'sequence', format: 'png', width: 32, height: 32, fps: 30, durationInFrames: 4, entrypoint: 'src/main.tsx', input: {} };
  // Every frame asynchronously prepares distinct pixels. Two independently
  // released handles must both clear; the red placeholder is never acceptable.
  const source = capsule(`import {useState,useLayoutEffect} from 'react';import {FullFrame,useFrame,holdFrame,releaseFrame} from '@creativesos/cut';export default function Scene(){const frame=useFrame();const [prepared,setPrepared]=useState(-1);const [second,setSecond]=useState(-1);useLayoutEffect(()=>{const a=holdFrame({timeoutMs:2000}),b=holdFrame({timeoutMs:2000});const one=setTimeout(()=>{setPrepared(frame);releaseFrame(a)},80);const two=setTimeout(()=>{setSecond(frame);releaseFrame(b)},140);return()=>{clearTimeout(one);clearTimeout(two);releaseFrame(a);releaseFrame(b)}},[frame]);return <FullFrame style={{background:prepared!==frame||second!==frame?'#ff0000':frame%2?'#0000ff':'#00ff00'}}/>}`);
  const rendered = await renderIsolated({ request, source, image });
  const replay = await renderIsolated({ request, source, image });
  assert.deepEqual(rendered.artifact, replay.artifact, 'Held async state must preserve owned frame-sequence replay.');
  const files = unzipSync(rendered.artifact);
  for (let frame = 0; frame < 4; frame++) {
    const png = files[`frame-${String(frame).padStart(6, '0')}.png`];
    assert.ok(png);
    const pixel = [...execFileSync('ffmpeg', ['-v', 'error', '-f', 'image2pipe', '-i', 'pipe:0', '-vf', 'format=rgba,crop=1:1:16:16', '-f', 'rawvideo', 'pipe:1'], { input: png, windowsHide: true })];
    assert.deepEqual(pixel, frame % 2 ? [0, 0, 255, 255] : [0, 255, 0, 255]);
    await writeFile(`${directory}async-prepared-frame-${frame}.png`, png);
  }
  await writeFile(`${directory}async-prepared-sequence.zip`, rendered.artifact);
  // Failure must return no accepted artifact and cleanup must preserve the
  // independent host deadline. Never print authored exception contents.
  for (const [name, code] of [
    ['timeout', `import {useState} from 'react';import {holdFrame} from '@creativesos/cut';export default function Scene(){useState(()=>holdFrame({timeoutMs:80}));return <div/>}`],
    ['cancel', `import {useState,useEffect} from 'react';import {holdFrame,failRender} from '@creativesos/cut';export default function Scene(){useState(()=>holdFrame());useEffect(()=>{const timer=setTimeout(()=>failRender(),40);return()=>clearTimeout(timer)},[]);return <div/>}`],
    ['too-many', `import {useState} from 'react';import {holdFrame} from '@creativesos/cut';export default function Scene(){useState(()=>Array.from({length:65},()=>holdFrame()));return <div/>}`],
  ]) {
    await assert.rejects(renderIsolated({ request: { ...request, mode: 'still', frame: 0 }, source: capsule(code), image, timeoutMs: 15_000 }), /CutStudio isolated code render failed \(render\)/);
    console.log(`PASS explicit frame preparation ${name} rejects instead of accepting a placeholder`);
  }
  console.log('PASS actual async per-frame state, multiple holds, committed pixels and identical replay');
  return [{ test: 'async-frame-readiness', ...rendered.receipt, isolation: rendered.isolation }];
}
