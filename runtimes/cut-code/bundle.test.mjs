import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { readCapsule, bundleCapsule } from './bundle.mjs';

function archive(source, extra = {}) { return zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'src/index.tsx': strToU8(source), ...extra }); }
test('bundles real TSX and the clean-room frame SDK without running source code', async () => {
  const source = `import {FullFrame,useFrame,interpolate} from '@creativesos/cut'; export default function Scene(){const f=useFrame();return <FullFrame style={{left:interpolate(f,[0,30],[0,100])}}>Frame {f}</FullFrame>}`;
  const bundle = await bundleCapsule(readCapsule(archive(source), 'src/index.tsx'), 'src/index.tsx');
  assert.ok(bundle.includes('__cutRenderFrame'));
});
test('rejects host, network and unapproved dependency imports', async () => {
  for (const specifier of ['node:fs', 'child_process', 'https://example.com/code.js', '/etc/passwd', '../../host.ts', 'unapproved-package', 'three/addons/loaders/GLTFLoader.js', 'three/src/Three.js']) {
    const files = readCapsule(archive(`import x from '${specifier}';export default x;`), 'src/index.tsx');
    await assert.rejects(bundleCapsule(files, 'src/index.tsx'));
  }
});
test('pins Three core and its approved vector renderer without admitting arbitrary addons', async () => {
  const source = `import {Scene,BoxGeometry,Mesh,MeshBasicMaterial} from 'three';import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';export default ()=>{const scene=new Scene();scene.add(new Mesh(new BoxGeometry(),new MeshBasicMaterial()));return <div>{new SVGRenderer().info.render.faces}</div>};`;
  const manifest = { 'package.json': strToU8(JSON.stringify({ dependencies: { react: '18.3.1', three: '0.185.1' } })) };
  assert.ok(await bundleCapsule(readCapsule(archive(source, manifest), 'src/index.tsx'), 'src/index.tsx'));
  for (const version of ['^0.185.1', 'latest', '0.184.0']) assert.throws(() => readCapsule(archive(source, { 'package.json': strToU8(JSON.stringify({ dependencies: { three: version } })) }), 'src/index.tsx'));
});
test('allows private relative TSX imports and rejects escaping archive paths', async () => {
  const files = readCapsule(archive(`export {default} from './title';`, { 'src/title.tsx': strToU8('export default () => <h1>Private title</h1>') }), 'src/index.tsx');
  assert.ok(await bundleCapsule(files, 'src/index.tsx'));
  assert.throws(() => readCapsule(archive('export default null', { '../escape': strToU8('no') }), 'src/index.tsx'));
});
