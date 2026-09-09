import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { renderIsolated } from './host.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'creativesos-webgl-scene-'));
const source = Buffer.from(zipSync({
  'package.json': strToU8(JSON.stringify({ dependencies: { react: '18.3.1', three: '0.185.1' } })),
  // ShaderMaterial is intentional: this proves the narrow bridge reaches real
  // software-WebGL pixels, rather than accepting an SVG-only Three scene.
  'src/index.tsx': strToU8(`import React,{useMemo}from 'react';import {FullFrame,WebGLScene,useFrame}from '@creativesos/cut';import * as THREE from 'three';export default function ShaderScene(){const frame=useFrame();const scene=useMemo(()=>new THREE.Scene(),[]);const camera=useMemo(()=>{const next=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);next.position.z=2;return next},[]);const mesh=useMemo(()=>{const material=new THREE.ShaderMaterial({uniforms:{phase:{value:0}},vertexShader:'varying vec2 uvOut;void main(){uvOut=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'precision mediump float;uniform float phase;varying vec2 uvOut;void main(){gl_FragColor=vec4(uvOut.x,phase,1.0-uvOut.y,1.0);}'});const next=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);scene.add(next);return next},[scene]);(mesh.material as THREE.ShaderMaterial).uniforms.phase.value=frame/30;return <FullFrame><WebGLScene scene={scene} camera={camera} width={320} height={180}/></FullFrame>}`),
}));

try {
  const image = process.env.CREATIVESOS_CUT_CODE_IMAGE ?? execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:production-candidate', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
  const request = { version: 1, mode: 'sequence', format: 'png', width: 320, height: 180, fps: 30, durationInFrames: 30, frameRange: [0, 10], entrypoint: 'src/index.tsx', input: {} };
  const rendered = await renderIsolated({ request, source, image, timeoutMs: 10_000, memoryMb: 512, maximumOutputBytes: 67_108_864 });
  const frames = unzipSync(rendered.artifact);
  assert.ok(frames['frame-000000.png']?.length && frames['frame-000010.png']?.length, 'The WebGL sequence must contain its requested frames.');
  const initial = Buffer.from(frames['frame-000000.png']);
  const later = Buffer.from(frames['frame-000010.png']);
  assert.notDeepEqual(initial, later, 'A frame-driven shader must produce distinct captured frames in one live WebGL sequence.');
  const initialPath = path.join(directory, 'webgl-initial.png');
  const laterPath = path.join(directory, 'webgl-later.png');
  await writeFile(initialPath, initial); await writeFile(laterPath, later);
  const sample = (filename) => execFileSync('ffmpeg', ['-v', 'error', '-i', filename, '-vf', 'crop=1:1:160:90,format=rgba', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const initialPixel = sample(initialPath); const laterPixel = sample(laterPath);
  assert.equal(initialPixel.length, 4); assert.equal(laterPixel.length, 4);
  assert.ok(laterPixel[1] > initialPixel[1] + 50, `Expected the shader's green uniform to advance, received ${[...initialPixel]} -> ${[...laterPixel]}.`);
  console.log(JSON.stringify({ passed: true, renderer: 'software-webgl', format: 'png-sequence', frameDriven: true, initialPixel: [...initialPixel], laterPixel: [...laterPixel], initialBytes: initial.length, laterBytes: later.length }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
