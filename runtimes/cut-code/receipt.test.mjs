import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertArtifactReceipt } from './host.mjs';
import { validateRequest, outputContract } from './request.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('ProRes receipts bind the chosen profile independently of container identity', () => {
  const artifact = Buffer.from('unit fixture'), source = Buffer.from('source');
  const request = validateRequest({ version: 1, mode: 'video', format: 'mov', proresProfile: '4444', width: 64, height: 32, fps: 30, durationInFrames: 6, entrypoint: 'index.tsx', input: {} });
  const output = outputContract(request);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', bytes: artifact.length, artifactSha256: hash(artifact), sourceSha256: hash(source), requestSha256: hash(JSON.stringify(request)), width: request.width, height: request.height, fps: request.fps, mode: request.mode, format: request.format, quality: request.quality, start: output.start, end: output.end, frames: output.frames, mediaType: output.mediaType, proresProfile: request.proresProfile, audioTrackCount: 0, silent: true };
  assert.doesNotThrow(() => assertArtifactReceipt(artifact, receipt, request, source));
  for (const change of [{ proresProfile: undefined }, { proresProfile: '422hq' }, { format: 'mp4' }, { mediaType: 'video/mp4' }]) assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, ...change }, request, source));
});
test('receipts reject altered encoding quality and speed controls', () => {
  const artifact = Buffer.from('unit custody fixture'), source = Buffer.from('source');
  const request = validateRequest({ version: 1, mode: 'video', width: 160, height: 90, fps: 30, durationInFrames: 6, entrypoint: 'main.tsx', input: {}, videoEncoding: { crf: 8, preset: 'fast' } });
  const output = outputContract(request);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', bytes: artifact.length, artifactSha256: hash(artifact), sourceSha256: hash(source), requestSha256: hash(JSON.stringify(request)), width: request.width, height: request.height, fps: request.fps, mode: request.mode, format: request.format, quality: request.quality, start: output.start, end: output.end, frames: output.frames, mediaType: output.mediaType, videoEncoding: request.videoEncoding, audioTrackCount: 0, silent: true };
  assert.doesNotThrow(() => assertArtifactReceipt(artifact, receipt, request, source));
  for (const videoEncoding of [undefined, { crf: 48, preset: 'fast' }, { crf: 8, preset: 'slow' }, { bitrateKbps: 1000, preset: 'fast' }]) assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, videoEncoding }, request, source));
});

test('GIF receipts bind sampled frame counts, timing range and repeat choices', () => {
  const artifact = Buffer.from('unit custody fixture'), source = Buffer.from('source');
  const request = validateRequest({ version: 1, mode: 'video', format: 'gif', width: 65, height: 33, fps: 25, durationInFrames: 10, frameRange: [3, 9], gifOptions: { frameStep: 3, repeatCount: 2 }, entrypoint: 'index.tsx', input: {} });
  const output = outputContract(request);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', bytes: artifact.length, artifactSha256: hash(artifact), sourceSha256: hash(source), requestSha256: hash(JSON.stringify(request)), width: request.width, height: request.height, fps: request.fps, mode: request.mode, format: request.format, quality: request.quality, start: output.start, end: output.end, frames: output.frames, mediaType: output.mediaType, gifOptions: request.gifOptions, audioTrackCount: 0, silent: true };
  assert.doesNotThrow(() => assertArtifactReceipt(artifact, receipt, request, source));
  for (const change of [{ frames: 7 }, { gifOptions: undefined }, { gifOptions: { frameStep: 3, repeatCount: null } }, { gifOptions: { frameStep: 1, repeatCount: 2 } }, { audioTrackCount: 1 }, { silent: false }, { mediaType: 'video/mp4' }]) assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, ...change }, request, source));
});
test('audio-only receipts bind explicit soundtracks and generated silence', () => {
  const artifact = Buffer.from('not an encoded media test'), source = Buffer.from('source');
  for (const audioTracks of [[], [{ file: 'music.wav' }]]) {
    const request = validateRequest({ version: 1, mode: 'audio', width: 320, height: 180, fps: 30, durationInFrames: 30, entrypoint: 'index.tsx', input: {}, audioTracks });
    const output = outputContract(request);
    const receipt = { version: 1, runtime: 'cut-code-prototype-v1', bytes: artifact.length, artifactSha256: hash(artifact), sourceSha256: hash(source), requestSha256: hash(JSON.stringify(request)), width: request.width, height: request.height, fps: request.fps, mode: request.mode, format: request.format, quality: request.quality, start: output.start, end: output.end, frames: output.frames, mediaType: output.mediaType, audioTrackCount: audioTracks.length, silent: !audioTracks.length };
    assert.doesNotThrow(() => assertArtifactReceipt(artifact, receipt, request, source));
    for (const change of [{ mode: 'video' }, { format: 'mp3' }, { mediaType: 'video/mp4' }, { silent: !!audioTracks.length }, { audioTrackCount: 8 }]) assert.throws(() => assertArtifactReceipt(artifact, { ...receipt, ...change }, request, source));
  }
});

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
