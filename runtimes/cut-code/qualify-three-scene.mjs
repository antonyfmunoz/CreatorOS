import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { renderIsolated } from './host.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'creativesos-three-scene-'));
const source = Buffer.from(zipSync({
  'package.json': strToU8(JSON.stringify({ dependencies: { react: '18.3.1', three: '0.185.1' } })),
  'src/index.tsx': strToU8(`import {FullFrame,SvgScene,useFrame} from '@creativesos/cut';import {BoxGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene} from 'three';export default function ThreeScene(){const frame=useFrame();const scene=new Scene();const cube=new Mesh(new BoxGeometry(1.4,1.4,1.4),new MeshBasicMaterial({color:'#00ff00'}));cube.rotation.y=frame*.12;scene.add(cube);const camera=new PerspectiveCamera(45,16/9,.1,10);camera.position.z=3;return <FullFrame><SvgScene scene={scene} camera={camera} width={320} height={180}/></FullFrame>}`),
}));

try {
  const image = process.env.CREATIVESOS_CUT_CODE_IMAGE ?? execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:production-candidate', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim();
  const request = { version: 1, mode: 'still', width: 320, height: 180, fps: 30, durationInFrames: 30, frame: 0, entrypoint: 'src/index.tsx', input: {} };
  const initial = await renderIsolated({ request, source, image });
  const later = await renderIsolated({ request: { ...request, frame: 10 }, source, image });
  assert.notDeepEqual(initial.artifact, later.artifact, 'A frame-driven Three scene must produce distinct captured frames.');
  const output = path.join(directory, 'three-scene.png');
  await writeFile(output, initial.artifact);
  const pixel = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-vf', 'crop=1:1:160:90,format=rgba', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  assert.equal(pixel.length, 4);
  assert.ok(pixel[1] > 180 && pixel[0] < 80 && pixel[2] < 80, `Expected captured green Three geometry, received ${[...pixel]}.`);
  console.log(JSON.stringify({ passed: true, format: 'png', frameDriven: true, centerPixel: [...pixel], initialBytes: initial.artifact.length, laterBytes: later.artifact.length }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
