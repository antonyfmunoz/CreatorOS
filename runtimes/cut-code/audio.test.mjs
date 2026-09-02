import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from './request.mjs';
import { audioPlan } from './audio.mjs';
const base = { version: 1, mode: 'video', width: 320, height: 180, fps: 30, durationInFrames: 60, entrypoint: 'index.tsx', input: {} };
test('audio planning retains absolute trim, speed and sample-accurate offsets across range exports', () => {
  const request = validateRequest({ ...base, frameRange: [15, 44], audioTracks: [
    { file: 'sound/music.wav', startFrame: 0, endFrame: 30, sourceStartSeconds: 1, speed: 2, volume: .5 },
    { file: 'sound/voice.mp3', startFrame: 20, endFrame: 60 },
    { file: 'sound/earlier.flac', startFrame: 0, endFrame: 15 },
  ] });
  const plan = audioPlan(request);
  assert.equal(plan.length, 2);
  assert.deepEqual({ start: plan[0].sourceStart, sourceDuration: plan[0].sourceDuration, duration: plan[0].duration, delay: plan[0].delaySamples }, { start: 2, sourceDuration: 1, duration: .5, delay: 0 });
  assert.equal(plan[1].delaySamples, 8000);
  assert.equal(plan[1].duration, 25 / 30);
  assert.deepEqual(validateRequest(request), request);
});
test('audio admission rejects external files, unsupported decoders and unbounded timing', () => {
  for (const track of [{ file: '../sound.wav' }, { file: 'https://example.com/a.wav' }, { file: 'sound.m3u8' }, { file: 'sound.wav', startFrame: -1 }, { file: 'sound.wav', endFrame: 61 }, { file: 'sound.wav', startFrame: 2, endFrame: 2 }, { file: 'sound.wav', sourceStartSeconds: 120 }, { file: 'sound.wav', speed: 0 }, { file: 'sound.wav', volume: 3 }]) assert.throws(() => validateRequest({ ...base, audioTracks: [track] }));
  assert.throws(() => validateRequest({ ...base, mode: 'still', audioTracks: [{ file: 'a.wav' }] }));
  assert.throws(() => validateRequest({ ...base, audioTracks: Array.from({ length: 9 }, () => ({ file: 'a.wav' })) }));
});
