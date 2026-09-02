import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest, outputContract } from './request.mjs';
const valid = { version: 1, mode: 'still', width: 1920, height: 1080, fps: 30, durationInFrames: 60, frame: 30, entrypoint: 'src/main.tsx', input: { title: 'Launch' } };
test('audio-only exports have separate duration, container and bounded track contracts', () => {
  const base = { ...valid, mode: 'audio', frame: 0, durationInFrames: 3600, audioTracks: [] };
  for (const [format, mediaType] of [['wav', 'audio/wav'], ['mp3', 'audio/mpeg'], ['m4a', 'audio/mp4']]) {
    const request = validateRequest({ ...base, format });
    assert.deepEqual(validateRequest(request), request);
    assert.deepEqual(outputContract(request), { start: 0, end: 3599, frames: 3600, mediaType, extension: format });
    assert.equal(request.quality, null);
  }
  assert.equal(validateRequest(base).format, 'wav');
  const range = validateRequest({ ...base, durationInFrames: 108000, frameRange: [107970, 107999] });
  assert.equal(outputContract(range).start, 107970);
  for (const change of [{ durationInFrames: 3601 }, { format: 'mp4' }, { format: 'aac' }, { format: 'png' }, { quality: 90 }, { frame: 1 }, { audioTracks: Array(9).fill({ file: 'a.wav' }) }]) assert.throws(() => validateRequest({ ...base, ...change }));
});
test('accepts bounded frame-driven render requests', () => assert.deepEqual(validateRequest(valid), { ...valid, format: 'png', quality: null, audioTracks: [] }));
test('rejects malformed, oversized and escaping requests before execution', () => {
  for (const change of [{ mode: 'video', frame: 0, width: 1921 }, { height: 0 }, { fps: 0 }, { fps: 61 }, { frame: 60 }, { frame: -1 }, { durationInFrames: 108001 }, { entrypoint: '../main.tsx' }, { entrypoint: '/main.tsx' }, { input: [] }, { input: { oversized: 'x'.repeat(65000) } }, { mode: 'shell' }, { version: 2 }, { mode: 'video', width: 3840, height: 2160, durationInFrames: 600 }]) assert.throws(() => validateRequest({ ...valid, ...change }));
});
test('WebM video has an explicit format contract without bypassing existing budgets', () => {
  const video = validateRequest({ ...valid, frame: 0, mode: 'video', format: 'webm', frameRange: [10, 19] });
  assert.deepEqual(outputContract(video), { start: 10, end: 19, frames: 10, extension: 'webm', mediaType: 'video/webm' });
  assert.deepEqual(validateRequest(video), video);
  for (const change of [{ mode: 'still' }, { mode: 'sequence' }, { quality: 90 }, { width: 321 }, { height: 181 }, { width: 3840, height: 2160, durationInFrames: 600, frameRange: [0, 599] }]) assert.throws(() => validateRequest({ ...video, ...change }));
});
test('long timelines and odd-sized stills do not bypass per-render compute limits', () => {
  const poster = validateRequest({ ...valid, width: 321, height: 181, durationInFrames: 108000, frame: 107999 });
  assert.equal(outputContract(poster).frames, 1);
  const chunk = validateRequest({ ...valid, frame: 0, mode: 'video', durationInFrames: 108000, frameRange: [107990, 107999] });
  assert.equal(outputContract(chunk).frames, 10);
  assert.throws(() => validateRequest({ ...valid, frame: 0, mode: 'video', durationInFrames: 108000 }));
  assert.throws(() => validateRequest({ ...valid, frame: 0, mode: 'sequence', durationInFrames: 108000, frameRange: [0, 600] }));
  assert.throws(() => validateRequest({ ...valid, durationInFrames: 108000, fps: 1 }));
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
