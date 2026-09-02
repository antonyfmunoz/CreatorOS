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
  for (const specifier of ['node:fs', 'child_process', 'https://example.com/code.js', '/etc/passwd', '../../host.ts', 'unapproved-package']) {
    const files = readCapsule(archive(`import x from '${specifier}';export default x;`), 'src/index.tsx');
    await assert.rejects(bundleCapsule(files, 'src/index.tsx'));
  }
});
test('allows private relative TSX imports and rejects escaping archive paths', async () => {
  const files = readCapsule(archive(`export {default} from './title';`, { 'src/title.tsx': strToU8('export default () => <h1>Private title</h1>') }), 'src/index.tsx');
  assert.ok(await bundleCapsule(files, 'src/index.tsx'));
  assert.throws(() => readCapsule(archive('export default null', { '../escape': strToU8('no') }), 'src/index.tsx'));
});
