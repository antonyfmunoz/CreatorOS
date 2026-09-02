import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from './request.mjs';
const valid = { version: 1, mode: 'still', width: 1920, height: 1080, fps: 30, durationInFrames: 60, frame: 30, entrypoint: 'src/main.tsx', input: { title: 'Launch' } };
test('accepts bounded frame-driven render requests', () => assert.deepEqual(validateRequest(valid), valid));
test('rejects malformed, oversized and escaping requests before execution', () => {
  for (const change of [{ width: 1921 }, { height: 0 }, { fps: 0 }, { fps: 61 }, { frame: 60 }, { frame: -1 }, { durationInFrames: 601 }, { entrypoint: '../main.tsx' }, { entrypoint: '/main.tsx' }, { input: [] }, { input: { oversized: 'x'.repeat(65000) } }, { mode: 'shell' }, { version: 2 }, { mode: 'video', width: 3840, height: 2160, durationInFrames: 600 }]) assert.throws(() => validateRequest({ ...valid, ...change }));
});
