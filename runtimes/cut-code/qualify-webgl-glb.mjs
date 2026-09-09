import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { renderIsolated } from './host.mjs';
import { createTriangleGlb } from './private-glb-fixtures.mjs';

// This uses a real self-contained binary GLB imported through the capsule
// bundler. It proves the safe GLB path reaches pixels under the same sealed
// software-WebGL boundary as production, not merely that Three can create a
// geometry in authored source.
const directory = await mkdtemp(path.join(os.tmpdir(), 'creativesos-webgl-glb-'));

try {
  const source = Buffer.from(zipSync({
    'package.json': strToU8(JSON.stringify({ dependencies: { react: '18.3.1', three: '0.185.1' } })),
    'src/triangle.glb': createTriangleGlb(),
    'src/index.tsx': strToU8(`import React,{useMemo}from 'react';import {FullFrame,WebGLScene,usePrivateGLTF}from '@creativesos/cut';import * as THREE from 'three';import modelSource from './triangle.glb';export default function PrivateGlbScene(){const model=usePrivateGLTF(modelSource);const scene=useMemo(()=>{const next=new THREE.Scene();next.background=new THREE.Color('#080808');next.add(new THREE.AmbientLight('#ffffff',3));return next},[]);const camera=useMemo(()=>{const next=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);next.position.z=2;return next},[]);if(model&&!model.parent)scene.add(model);return <FullFrame><WebGLScene scene={scene} camera={camera} width={160} height={90}/></FullFrame>}`),
  }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const image = process.env.CREATIVESOS_CUT_CODE_IMAGE ?? execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:production-candidate', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
  const request = { version: 1, mode: 'still', format: 'png', width: 160, height: 90, fps: 30, durationInFrames: 1, entrypoint: 'src/index.tsx', input: {} };
  const rendered = await renderIsolated({ request, source, image, timeoutMs: 10_000, memoryMb: 512, maximumOutputBytes: 16_777_216 });
  const outputPath = path.join(directory, 'private-glb.png');
  await writeFile(outputPath, rendered.artifact);
  const center = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', outputPath, '-vf', 'crop=1:1:80:45,format=rgba', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, timeout: 10_000 });
  assert.equal(center.length, 4);
  assert.ok(center[0] > 140 && center[0] > center[1] * 2 && center[0] > center[2] * 2 && center[3] === 255, `Expected the imported GLB triangle at the center pixel, received ${[...center]}.`);
  console.log(JSON.stringify({ passed: true, renderer: 'software-webgl', model: 'capsule-local-self-contained-glb', output: 'png-still', centerPixel: [...center], artifactBytes: rendered.artifact.length }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
