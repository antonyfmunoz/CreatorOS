import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePrivateGlb } from './private-glb.mjs';
import { createTriangleGlb } from './private-glb-fixtures.mjs';

function asDataUrl(bytes) { return `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`; }

test('decodes a self-contained GLB whose geometry and material stay inside the capsule', () => {
  const source = createTriangleGlb();
  const decoded = decodePrivateGlb(asDataUrl(source));
  assert.deepEqual([...new Uint8Array(decoded)], [...source]);
});

test('rejects malformed formats, headers, chunks and all URI-bearing metadata before a loader sees it', () => {
  assert.throws(() => decodePrivateGlb('https://example.invalid/scene.glb'), /binary GLB/i);
  assert.throws(() => decodePrivateGlb('data:model/gltf-binary;base64,AAAA'), /binary GLB/i);
  const wrongVersion = createTriangleGlb(); new DataView(wrongVersion.buffer).setUint32(4, 1, true);
  assert.throws(() => decodePrivateGlb(asDataUrl(wrongVersion)), /header/i);
  const wrongLength = createTriangleGlb(); new DataView(wrongLength.buffer).setUint32(8, wrongLength.length - 4, true);
  assert.throws(() => decodePrivateGlb(asDataUrl(wrongLength)), /header/i);
  const externalUri = createTriangleGlb({ uri: 'https://example.invalid/private.bin' });
  assert.throws(() => decodePrivateGlb(asDataUrl(externalUri)), /external resources/i);
  const nonStringUri = createTriangleGlb({ uri: 7 });
  assert.throws(() => decodePrivateGlb(asDataUrl(nonStringUri)), /external resources/i);
  const unsupportedChunk = createTriangleGlb(); new DataView(unsupportedChunk.buffer).setUint32(16, 0x12345678, true);
  assert.throws(() => decodePrivateGlb(asDataUrl(unsupportedChunk)), /begin with a JSON chunk|unsupported chunk/i);
});
