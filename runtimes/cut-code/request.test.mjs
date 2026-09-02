import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest, outputContract } from './request.mjs';
const valid = { version: 1, mode: 'still', width: 1920, height: 1080, fps: 30, durationInFrames: 60, frame: 30, entrypoint: 'src/main.tsx', input: { title: 'Launch' } };
test('accepts bounded frame-driven render requests', () => assert.deepEqual(validateRequest(valid), { ...valid, format: 'png', quality: null, audioTracks: [] }));
test('rejects malformed, oversized and escaping requests before execution', () => {
  for (const change of [{ width: 1921 }, { height: 0 }, { fps: 0 }, { fps: 61 }, { frame: 60 }, { frame: -1 }, { durationInFrames: 601 }, { entrypoint: '../main.tsx' }, { entrypoint: '/main.tsx' }, { input: [] }, { input: { oversized: 'x'.repeat(65000) } }, { mode: 'shell' }, { version: 2 }, { mode: 'video', width: 3840, height: 2160, durationInFrames: 600 }]) assert.throws(() => validateRequest({ ...valid, ...change }));
});
test('image formats, quality and inclusive ranges have explicit output contracts', () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const request = validateRequest({ ...valid, format });
    assert.equal(outputContract(request).frames, 1);
    assert.equal(outputContract(request).mediaType, `image/${format}`);
    assert.equal(request.quality, format === 'png' ? null : 90);
    assert.deepEqual(validateRequest(request), request, 'Request normalization must be idempotent for hash custody.');
  }
  const sequence = validateRequest({ ...valid, frame: 0, mode: 'sequence', frameRange: [10, 19] });
  assert.deepEqual(outputContract(sequence), { start: 10, end: 19, frames: 10, extension: 'zip', mediaType: 'application/zip' });
  const video = validateRequest({ ...valid, frame: 0, mode: 'video', frameRange: [59, 59] });
  assert.equal(outputContract(video).frames, 1);
  assert.equal(video.format, 'mp4');
  const bounded4k = validateRequest({ ...valid, frame: 0, mode: 'video', width: 3840, height: 2160, durationInFrames: 600, frameRange: [0, 9] });
  assert.equal(outputContract(bounded4k).frames, 10);
  for (const change of [{ frameRange: [0, 1] }, { quality: 50 }, { format: 'mp4' }, { format: 'jpeg', quality: 0 }, { format: 'webp', quality: 101 }, { mode: 'video' }, { mode: 'video', frame: 0, format: 'png' }, { mode: 'sequence', frame: 0, frameRange: [2, 1] }, { mode: 'sequence', frame: 0, frameRange: [-1, 10] }, { mode: 'sequence', frame: 0, frameRange: [0, 60] }, { mode: 'sequence', frame: 0, frameRange: [0] }]) assert.throws(() => validateRequest({ ...valid, ...change }));
});
