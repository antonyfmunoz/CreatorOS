import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameReadiness } from './frame-readiness.mjs';

test('waits for all handles, flushes state and permits idempotent cleanup', async () => {
  let elapsed = 0, sleeps = 0, flushed = 0;
  const gate = createFrameReadiness({ now: () => elapsed, sleep: async (ms) => { elapsed += ms; sleeps++; gate.release(sleeps === 1 ? a : b); } });
  const a = gate.hold(), b = gate.hold();
  assert.equal(await gate.wait(() => flushed++), 4);
  assert.equal(sleeps, 2);
  assert.equal(flushed, 3);
  gate.release(a); gate.release(b);
  assert.equal(await gate.wait(), 4);
  assert.throws(() => gate.release({}), /Unknown/);
  assert.throws(() => gate.release(null), /Unknown/);
});

test('timeout is sticky, begins at acquisition and cannot be renewed by release', async () => {
  let elapsed = 0;
  const gate = createFrameReadiness({ now: () => elapsed, sleep: async (ms) => { elapsed += ms; } });
  const handle = gate.hold({ timeoutMs: 20 });
  await assert.rejects(gate.wait(), /timed out/);
  assert.equal(elapsed, 20);
  assert.throws(() => gate.release(handle), /timed out/);
  assert.throws(() => gate.hold(), /timed out/);
  await assert.rejects(gate.wait(), /timed out/);
});

test('caps pending handles and validates deadlines without rejecting released capacity', async () => {
  const gate = createFrameReadiness();
  for (const timeoutMs of [0, -1, 30001, 1.2, NaN, Infinity, '10']) assert.throws(() => gate.hold({ timeoutMs }), /timeout/);
  const handles = Array.from({ length: 64 }, () => gate.hold({ timeoutMs: 30000 }));
  assert.throws(() => gate.hold(), /Too many/);
  gate.release(handles[0]);
  const replacement = gate.hold();
  handles.slice(1).forEach((handle) => gate.release(handle));
  gate.release(replacement);
  await gate.wait();
});

test('cancellation interrupts pending or settled frames and never becomes success', async () => {
  const gate = createFrameReadiness({ sleep: async () => gate.fail() });
  const handle = gate.hold();
  await assert.rejects(gate.wait(), /cancelled/);
  assert.throws(() => gate.release(handle), /cancelled/);
  await assert.rejects(gate.wait(), /cancelled/);
  const settled = createFrameReadiness();
  await settled.wait();
  settled.fail();
  await assert.rejects(settled.wait(), /cancelled/);
});
