import test from 'node:test';
import assert from 'node:assert/strict';
import { videoSourceTime } from './media-clock.mjs';

test('decimal source-loop boundaries resolve to the start across retimed frames', () => {
  for (let frame = 0; frame < 120; frame++) {
    const expected = ((2 + frame * 2) % 6) / 10;
    assert.ok(Math.abs(videoSourceTime((2 + frame * 2) / 10, .6, true) - expected) < 1e-12, `frame ${frame}`);
  }
  for (const duration of [.6, .1, 1 / 30, 1001 / 30000, 119.9]) {
    for (let loop = 0; loop < 1000; loop++) assert.equal(videoSourceTime(loop * duration, duration, true), 0);
  }
});

test('real pre-boundary tails and post-boundary offsets are not rounded to zero', () => {
  for (const boundary of [.6, 6.6, 24]) {
    const before = videoSourceTime(boundary - 1e-9, .6, true);
    const after = videoSourceTime(boundary + 1e-9, .6, true);
    assert.ok(before > .599999998 && before < .6);
    assert.ok(after > 0 && after < 2e-9);
  }
  assert.equal(videoSourceTime(6.6, .6, false), 6.6);
});

test('invalid source clocks fail closed', () => {
  for (const args of [[-1, .6, true], [Infinity, .6, true], [NaN, .6, true], [1, 0, true], [1, Infinity, true], [1, .6, 'yes']]) assert.throws(() => videoSourceTime(...args));
});
