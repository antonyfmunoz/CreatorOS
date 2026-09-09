import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { renderIsolated } from './host.mjs';

// A real, locally generated PNG is imported through the capsule bundler and
// decoded only in the isolated browser. This deliberately exercises the
// supported private-asset path instead of treating a hand-built DataTexture as
// evidence that authors can use their own capsule image files.
const directory = await mkdtemp(path.join(os.tmpdir(), 'creativesos-webgl-texture-'));

try {
  const texturePath = path.join(directory, 'private-red.png');
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=16x16:r=1', '-frames:v', '1', texturePath], { windowsHide: true, timeout: 10_000 });
  const texture = await readFile(texturePath);
  const source = Buffer.from(zipSync({
    'package.json': strToU8(JSON.stringify({ dependencies: { react: '18.3.1', three: '0.185.1' } })),
    'src/private-red.png': texture,
    'src/index.tsx': strToU8(`import React,{useMemo}from 'react';import {FullFrame,WebGLScene,usePrivateTexture}from '@creativesos/cut';import * as THREE from 'three';import privateTexture from './private-red.png';export default function TexturedScene(){const texture=usePrivateTexture(privateTexture);const scene=useMemo(()=>new THREE.Scene(),[]);const camera=useMemo(()=>{const next=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);next.position.z=2;return next},[]);const mesh=useMemo(()=>{const next=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());scene.add(next);return next},[scene]);if(!texture)return null;mesh.material.map=texture;mesh.material.needsUpdate=true;return <FullFrame><WebGLScene scene={scene} camera={camera} width={160} height={90}/></FullFrame>}`),
  }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const image = process.env.CREATIVESOS_CUT_CODE_IMAGE ?? execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:production-candidate', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
  const request = { version: 1, mode: 'still', format: 'png', width: 160, height: 90, fps: 30, durationInFrames: 1, entrypoint: 'src/index.tsx', input: {} };
  const rendered = await renderIsolated({ request, source, image, timeoutMs: 10_000, memoryMb: 512, maximumOutputBytes: 16_777_216 });
  const outputPath = path.join(directory, 'private-texture.png');
  await writeFile(outputPath, rendered.artifact);
  const center = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', outputPath, '-vf', 'crop=1:1:80:45,format=rgba', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, timeout: 10_000 });
  assert.equal(center.length, 4);
  assert.ok(center[0] > 180 && center[1] < 80 && center[2] < 80 && center[3] === 255, `Expected the isolated imported texture at the center pixel, received ${[...center]}.`);
  console.log(JSON.stringify({ passed: true, renderer: 'software-webgl', texture: 'capsule-local-png', output: 'png-still', centerPixel: [...center], artifactBytes: rendered.artifact.length }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
