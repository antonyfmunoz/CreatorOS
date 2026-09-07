import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { renderIsolated } from './host.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'creativesos-three-scene-'));
const source = Buffer.from(zipSync({
  'package.json': strToU8(JSON.stringify({ dependencies: { react: '18.3.1', three: '0.185.1' } })),
  // This intentionally keeps both Three objects stable, matching the editable
  // CutStudio starter. A frame-reactive SVG bridge must still recapture it.
  'src/index.tsx': strToU8(`import React,{useMemo}from 'react';import {FullFrame,SvgScene,useFrame}from '@creativesos/cut';import * as THREE from 'three';export default function ThreeScene(){const frame=useFrame();const scene=useMemo(()=>{const next=new THREE.Scene();const cube=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,1.4),new THREE.MeshBasicMaterial({color:'#00ff00'}));cube.name='hero-cube';next.add(cube);return next},[]);const camera=useMemo(()=>{const next=new THREE.PerspectiveCamera(45,16/9,.1,10);next.position.z=3;return next},[]);const cube=scene.getObjectByName('hero-cube');if(cube)cube.rotation.y=frame*.12;return <FullFrame><SvgScene scene={scene} camera={camera} width={320} height={180}/></FullFrame>}`),
}));

try {
  const image = process.env.CREATIVESOS_CUT_CODE_IMAGE ?? execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:production-candidate', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
  // One sequence keeps the browser and React tree alive across frames. This
  // catches a capture bridge that only responds to new scene identities.
  const request = { version: 1, mode: 'sequence', format: 'png', width: 320, height: 180, fps: 30, durationInFrames: 30, frameRange: [0, 10], entrypoint: 'src/index.tsx', input: {} };
  const rendered = await renderIsolated({ request, source, image });
  const frames = unzipSync(rendered.artifact);
  assert.ok(frames['frame-000000.png']?.length && frames['frame-000010.png']?.length, 'The stable-scene sequence must contain its requested frames.');
  const initial = Buffer.from(frames['frame-000000.png']);
  const later = Buffer.from(frames['frame-000010.png']);
  assert.notDeepEqual(initial, later, 'A frame-driven Three scene must produce distinct captured frames in one live sequence.');
  const output = path.join(directory, 'three-scene.png');
  await writeFile(output, initial);
  const pixel = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-vf', 'crop=1:1:160:90,format=rgba', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  assert.equal(pixel.length, 4);
  assert.ok(pixel[1] > 180 && pixel[0] < 80 && pixel[2] < 80, `Expected captured green Three geometry, received ${[...pixel]}.`);
  console.log(JSON.stringify({ passed: true, format: 'png-sequence', frameDriven: true, centerPixel: [...pixel], initialBytes: initial.length, laterBytes: later.length }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
