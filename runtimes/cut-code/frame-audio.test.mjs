import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameAudioCollector, validateFrameAudio, frameVolumeExpression } from './frame-audio.mjs';
import { validateRequest } from './request.mjs';
import { volumeAutomationFilter } from './audio.mjs';

const base = { version: 1, mode: 'video', width: 64, height: 32, fps: 30, durationInFrames: 60, entrypoint: 'main.tsx', input: {}, compositionAudio: true };
const sample = (frame, change = {}) => ({ id: ':r0:', file: 'sound.wav', sourceSeconds: frame / 30, speed: 1, volume: .5, audioStream: 0, ...change });

test('composition soundtrack opt-in preserves old requests and rejects unsupported modes or limits', () => {
  assert.equal(validateRequest(base).compositionAudio, true);
  assert.equal('compositionAudio' in validateRequest({ ...base, compositionAudio: undefined }), false);
  for (const change of [{ compositionAudio: false }, { compositionAudio: 'yes' }, { mode: 'audio' }, { mode: 'still' }, { mode: 'sequence' }, { format: 'gif' }, { fps: 1, durationInFrames: 121 }]) assert.throws(() => validateRequest({ ...base, ...change }));
});

test('collector preserves ranged source time, each frame gain, discontinuities and silence gaps', () => {
  const collector = new FrameAudioCollector(validateRequest({ ...base, frameRange: [9, 14] }));
  collector.capture(9, [sample(19, { speed: 2 })]);
  collector.capture(10, [sample(21, { speed: 2, volume: 0 })]);
  collector.capture(11, []);
  collector.capture(12, [sample(0)]);
  collector.capture(13, [sample(1)]);
  collector.capture(14, [sample(0)]);
  const tracks = collector.finish();
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks[0], { file: 'sound.wav', startFrame: 9, endFrame: 11, sourceStartSeconds: 19 / 30, speed: 2, volume: 1, audioStream: 0, volumeSamples: [.5, 0] });
  assert.deepEqual(tracks[1].volumeSamples, [.5, .5]);
  assert.equal(tracks[2].startFrame, 14);
});

test('all descriptor values and ordered collection are bounded and fail closed', () => {
  for (const change of [{ id: '' }, { id: 'x'.repeat(101) }, { file: '../a.wav' }, { file: '/a.wav' }, { file: 'https://host/a.wav' }, { file: 'a.m3u8' }, { file: 'a.wav;cmd' }, { sourceSeconds: NaN }, { sourceSeconds: -1 }, { sourceSeconds: 120 }, { speed: .49 }, { speed: 2.1 }, { volume: Infinity }, { volume: 2.1 }, { audioStream: 8 }, { audioStream: .5 }]) assert.throws(() => validateFrameAudio(sample(0, change)));
  const make = (change = {}) => new FrameAudioCollector(validateRequest({ ...base, ...change }));
  assert.throws(() => make().capture(1, []));
  assert.throws(() => make().capture(0, Array.from({ length: 9 }, (_, id) => sample(0, { id: String(id) }))));
  assert.throws(() => make().capture(0, [sample(0), sample(0)]));
  assert.throws(() => make().finish());
  const capped = make({ audioTracks: Array.from({ length: 7 }, () => ({ file: 'explicit.wav' })) });
  capped.capture(0, [sample(0)]);
  assert.throws(() => capped.capture(1, [sample(0)]), /eight combined/);
});

test('600 frame gains use bounded logarithmic expressions and static gains collapse', () => {
  const samples = Array.from({ length: 600 }, (_, frame) => (frame % 3) / 2);
  const expression = frameVolumeExpression(samples, 30, 0);
  assert.ok(expression.length < 30_000);
  let depth = 0, maximum = 0;
  for (const char of expression) { if (char === '(') maximum = Math.max(maximum, ++depth); else if (char === ')') depth--; }
  assert.equal(depth, 0); assert.ok(maximum <= 12);
  assert.equal(frameVolumeExpression(Array(600).fill(.25), 30), '0.25');
  assert.match(volumeAutomationFilter({ volumeSamples: [0, 1], localStartFrame: 0 }, 30), /aeval=.*lt\(n,1600\)/);
  assert.equal(frameVolumeExpression([.25,.25,.25,.75,.75],30), 'if(lt(n,3200),0.25,if(lt(n,4800),0.25,0.75))');
  assert.equal(frameVolumeExpression([0,1],7), 'if(lt(n,6858),0,1)');
  for (const bad of [[], [NaN], [3], Array(601).fill(1)]) assert.throws(() => frameVolumeExpression(bad, 30));
});
