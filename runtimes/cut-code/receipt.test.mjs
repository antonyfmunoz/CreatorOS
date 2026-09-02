import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertArtifactReceipt } from './host.mjs';
import { validateRequest, outputContract } from './request.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('receipt binds the entire input, source, frame range, format and output bytes', () => {
  const artifact = Buffer.from('owned unit fixture, not a media qualification'), source = Buffer.from('source fixture');
  const request = validateRequest({ version: 1, mode: 'sequence', width: 320, height: 180, fps: 30, durationInFrames: 60, frameRange: [12, 17], entrypoint: 'index.tsx', input: { title: 'Launch' } });
  const output = outputContract(request);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', bytes: artifact.length, artifactSha256: hash(artifact), sourceSha256: hash(source), requestSha256: hash(JSON.stringify(request)), width: request.width, height: request.height, fps: request.fps, mode: request.mode, format: request.format, quality: request.quality, start: output.start, end: output.end, frames: output.frames, mediaType: output.mediaType, audioTrackCount: 0, silent: false };
  assert.doesNotThrow(() => assertArtifactReceipt(artifact, receipt, request, source));
  for (const change of [{ version: 2 }, { runtime: 'other' }, { bytes: 0 }, { artifactSha256: 'x' }, { sourceSha256: 'x' }, { requestSha256: 'x' }, { width: 640 }, { height: 360 }, { fps: 60 }, { mode: 'video' }, { format: 'webp' }, { quality: 50 }, { start: 11 }, { end: 18 }, { frames: 5 }, { mediaType: 'image/png' }]) assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, ...change }, request, source));
  assert.throws(() => assertArtifactReceipt(Buffer.from('different output'), receipt, request, source));
  assert.throws(() => assertArtifactReceipt(artifact, receipt, request, Buffer.from('different source')));
  assert.throws(() => assertArtifactReceipt(artifact, receipt, { ...request, input: { title: 'Different' } }, source));
  assert.throws(() => assertArtifactReceipt(artifact, null, request, source));
  assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, audioTrackCount: 1 }, request, source));
  assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, silent: true }, request, source));
});

test('receipts also bind the normalized soundtrack automation', () => {
  const artifact = Buffer.from('unit receipt fixture'), source = Buffer.from('source');
  const request = validateRequest({ version: 1, mode: 'video', width: 320, height: 180, fps: 30, durationInFrames: 60, entrypoint: 'index.tsx', input: {}, audioTracks: [{ file: 'tone.wav', volumeKeyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 1 }] }] });
  const output = outputContract(request);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', bytes: artifact.length, artifactSha256: hash(artifact), sourceSha256: hash(source), requestSha256: hash(JSON.stringify(request)), width: request.width, height: request.height, fps: request.fps, mode: request.mode, format: request.format, quality: request.quality, start: output.start, end: output.end, frames: output.frames, mediaType: output.mediaType, audioTrackCount: 1, silent: false };
  assert.doesNotThrow(() => assertArtifactReceipt(artifact, receipt, request, source));
  const changed = structuredClone(request);
  changed.audioTracks[0].volumeKeyframes[1].value = .5;
  assert.throws(() => assertArtifactReceipt(artifact, receipt, changed, source));
  changed.audioTracks[0].volumeKeyframes[1].value = 1;
  changed.audioTracks[0].volumeKeyframes[0].interpolation = 'hold';
  assert.throws(() => assertArtifactReceipt(artifact, receipt, changed, source));
});
