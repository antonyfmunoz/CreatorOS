import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, cubicBezier, easing, spring, measureSpring, seededRandom, interpolateColor } from './motion.mjs';
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('numeric keyframes preserve boundaries, easing and explicit extrapolation', () => {
  assert.equal(interpolate(-1, [0, 10, 20], [0, 100, 50]), 0);
  assert.equal(interpolate(20, [0, 10, 20], [0, 100, 50]), 50);
  assert.equal(interpolate(15, [0, 10, 20], [0, 100, 50]), 75);
  assert.equal(interpolate(5, [0, 10], [0, 100], { ease: easing.quadratic }), 25);
  assert.equal(interpolate(-5, [0, 10], [0, 100], { left: 'extend' }), -50);
  assert.equal(interpolate(15, [0, 10], [0, 100], { right: 'extend' }), 150);
  assert.equal(interpolate(-5, [0, 10], [0, 100], { left: 'wrap' }), 50);
  assert.equal(interpolate(25, [0, 10], [0, 100], { right: 'wrap' }), 50);
  for (const range of [[0, 0], [2, 1], [NaN, 1]]) assert.throws(() => interpolate(0, range, [0, 1]));
  assert.throws(() => interpolate(0, [0, 1], [0, 1], { ease: () => Infinity }));
  assert.throws(() => interpolate(0, [0, 1], [0, 1], { left: 'unknown' }));
});

test('bezier solves x-to-y timing instead of confusing parameter with progress', () => {
  const linear = cubicBezier(0, 0, 1, 1);
  for (const x of [0, .001, .1, .5, .9, .999, 1]) near(linear(x), x);
  const curve = cubicBezier(.42, 0, .58, 1);
  near(curve(.5), .5);
  assert.ok(curve(.25) < .25);
  assert.ok(curve(.75) > .75);
  assert.equal(curve(-1), 0); assert.equal(curve(2), 1);
  assert.throws(() => cubicBezier(-1, 0, .5, 1));
  assert.throws(() => curve(NaN));
  near(easing.out(easing.quadratic)(.5), .75);
  near(easing.inOut(easing.quadratic)(.25), .125);
  near(easing.inOut(easing.quadratic)(.75), .875);
});

test('physical springs cover under, critical and over damping with frame-order independence', () => {
  const options = { fps: 30, stiffness: 100, mass: 1 };
  assert.equal(spring({ ...options, frame: -1 }), 0);
  assert.equal(spring({ ...options, frame: 10, delay: 10, from: 20 }), 20);
  near(spring({ ...options, frame: 3, damping: 20 }), 1 - 2 / Math.E);
  assert.ok(spring({ ...options, frame: 10, damping: 5 }) > 1);
  assert.equal(spring({ ...options, frame: 10, damping: 5, clampOvershoot: true }), 1);
  const frames = Array.from({ length: 301 }, (_, frame) => frame);
  const values = frames.map((frame) => spring({ ...options, frame, damping: 40 }));
  assert.ok(values.every((value, index) => value >= 0 && value <= 1 && (index === 0 || value >= values[index - 1])));
  near(values.at(-1), 1);
  for (const frame of [...frames].reverse()) assert.equal(spring({ ...options, frame, damping: 40 }), values[frame]);
  for (const damping of [0, 10, 19.9999999, 20, 20.0000001, 40, 10000]) assert.ok(Number.isFinite(spring({ ...options, frame: 300, damping })));
  near(spring({ ...options, frame: 300, damping: 20, from: 100, to: -20 }), -20);
  for (const change of [{ mass: 0 }, { damping: -1 }, { stiffness: Infinity }, { fps: 0 }, { frame: NaN }, { delay: -1 }]) assert.throws(() => spring({ ...options, frame: 10, ...change }));
});

test('settling measurements cover the future continuous response, including near-critical springs', () => {
  for (const fps of [24, 30, 60, 120]) for (const damping of [.5, 5, 10, 19.99999, 20, 20.00001, 40, 500]) {
    const options = { fps, mass: 1, stiffness: 100, damping };
    const measured = measureSpring({ ...options, threshold: .005 });
    assert.ok(Number.isInteger(measured) && measured > 0 && measured <= 216000);
    // Fractional-frame probes also exercise peaks between frame boundaries.
    for (let index = 0; index <= 1000; index++) {
      const frame = measured + index * .37;
      assert.ok(Math.abs(spring({ ...options, frame }) - 1) <= .005 + 1e-12, `Unsettled ${damping} at ${frame}`);
    }
    assert.ok(measureSpring({ ...options, threshold: .001 }) >= measured);
    assert.equal(measureSpring({ ...options, threshold: .005 }), measured);
  }
  for (const change of [{ damping: 0 }, { threshold: 0 }, { threshold: NaN }, { threshold: .6 }, { maxFrames: 0 }, { maxFrames: 864001 }, { maxFrames: 1 }, { fps: 0 }]) {
    assert.throws(() => measureSpring({ fps: 30, ...change }));
  }
});

test('fixed-duration springs preserve delay, reversed timing, endpoint holding and arbitrary frame order', () => {
  const options = { fps: 30, mass: 1, stiffness: 100, damping: 10, durationInFrames: 45, delay: 10, from: 20, to: 100 };
  assert.equal(spring({ ...options, frame: -1 }), 20);
  assert.equal(spring({ ...options, frame: 10 }), 20);
  assert.equal(spring({ ...options, frame: 55 }), 100);
  assert.equal(spring({ ...options, frame: 1000 }), 100);
  assert.equal(spring({ ...options, frame: 10, reverse: true }), 100);
  assert.equal(spring({ ...options, frame: 55, reverse: true }), 20);
  const frames = [10, 10.25, 17, 30, 54.5, 55];
  for (const frame of frames) near(spring({ ...options, frame }), spring({ ...options, frame: 65 - frame, reverse: true }));
  const duration = measureSpring({ fps: 30 });
  assert.equal(spring({ fps: 30, frame: duration, reverse: true }), 0);
  for (const change of [{ durationInFrames: 0 }, { durationInFrames: 1.5 }, { durationInFrames: 216001 }, { reverse: 'yes' }, { threshold: 0 }, { damping: 0 }]) assert.throws(() => spring({ ...options, frame: 20, ...change }));
  // Existing undamped/unfitted oscillation remains supported.
  near(spring({ fps: 30, frame: 3, damping: 0 }), 1 - Math.cos(1));
});

test('seeded variation is repeatable, stateless and distinguishes seed types', () => {
  const values = Array.from({ length: 100 }, (_, index) => seededRandom(`particle:${index}`));
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.equal(new Set(values).size, values.length);
  for (let i = values.length - 1; i >= 0; i--) assert.equal(seededRandom(`particle:${i}`), values[i]);
  assert.notEqual(seededRandom(1), seededRandom('1'));
  assert.throws(() => seededRandom(Infinity));
  assert.throws(() => seededRandom({}));
});

test('hex color and alpha keyframes are bounded and explicit sRGB channel interpolation', () => {
  assert.equal(interpolateColor(.5, [0, 1], ['#ff0000', '#0000ff']), 'rgba(128,0,128,1)');
  assert.equal(interpolateColor(.5, [0, 1], ['#ff000000', '#ff0000ff']), 'rgba(255,0,0,0.5)');
  assert.equal(interpolateColor(2, [0, 1], ['#000000', '#ffffff'], { right: 'extend' }), 'rgba(255,255,255,1)');
  assert.throws(() => interpolateColor(.5, [0, 1], ['red', '#ff0000']));
  assert.throws(() => interpolateColor(.5, [0, 1], ['#ff0000']));
});
