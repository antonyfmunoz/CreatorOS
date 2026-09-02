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

test('bundles nested private styles, local module names, composition and image URLs', async () => {
  const files = readCapsule(archive(`import './theme.css'; import styles from './title.module.css'; export default () => <h1 className={styles.title}>Private title</h1>`, {
    'src/theme.css': strToU8('@import "palette.css"; h1 { color: red; }'),
    'src/palette.css': strToU8(':root { --brand: #00ff00; }'),
    'src/title.module.css': strToU8('.title { composes: base from "base.module.css"; color: var(--brand); background-image: url(../assets/logo.svg); filter:url(#shadow); }'),
    'src/base.module.css': strToU8('.base { font-weight: bold; }'),
    'assets/logo.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="blue" d="M0 0h2v2H0z"/></svg>'),
  }), 'src/index.tsx');
  const bundle = await bundleCapsule(files, 'src/index.tsx');
  assert.ok(bundle.startsWith('(()=>{const style=document.createElement'));
  assert.ok(bundle.includes('title_title'));
  assert.ok(bundle.includes('base_base'));
  assert.ok(bundle.includes('data:image/svg+xml'));
  assert.ok(bundle.includes('--brand'));
  assert.ok(bundle.includes('#shadow'));
});

test('rejects network, host, missing and unsupported stylesheet dependencies', async () => {
  const attempts = [
    '@import "https://example.invalid/style.css";', '@import "//example.invalid/style.css";',
    '@import "file:///etc/passwd";', '@import "../../outside.css";', '@import "missing.css";',
    '.x { background: url(https://example.invalid/a.png); }', '.x { background: url(/etc/passwd); }',
    '.x { background: url(data:image/png;base64,AAAA); }', '.x { background: url(../secret.json); }',
    '.x { background: url(../assets/a.png?query=yes); }',
    '.x { composes: other from "https://example.invalid/style.css"; }',
  ];
  for (const css of attempts) {
    const files = readCapsule(archive(`import styles from './x.module.css'; export default () => <div className={styles.x}/>`, {
      'src/x.module.css': strToU8(css), 'secret.json': strToU8('{}'),
    }), 'src/index.tsx');
    await assert.rejects(bundleCapsule(files, 'src/index.tsx'), undefined, css);
  }
});
