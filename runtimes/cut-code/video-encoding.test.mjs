import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVideoEncoding, videoEncodingArgs } from './video-encoding.mjs';
import { validateRequest } from './request.mjs';

test('bounded codec-specific quality, target bitrate and speed controls', () => {
  assert.deepEqual(normalizeVideoEncoding({}, 'video', 'mp4'), { crf: 23, preset: 'fast' });
  assert.deepEqual(normalizeVideoEncoding({ crf: 0, cpuUsed: 8 }, 'video', 'webm'), { crf: 0, cpuUsed: 8 });
  assert.deepEqual(normalizeVideoEncoding({ bitrateKbps: 2000, preset: 'medium' }, 'video', 'mp4'), { bitrateKbps: 2000, preset: 'medium' });
  for (const [format, settings] of [['mp4', { crf: 0 }], ['mp4', { crf: 52 }], ['webm', { crf: 64 }], ['mp4', { crf: 2.5 }], ['mp4', { crf: 18, bitrateKbps: 1000 }], ['mp4', { preset: 'fast;curl' }], ['webm', { preset: 'fast' }], ['mp4', { cpuUsed: 4 }], ['webm', { cpuUsed: 9 }], ['mp4', { bitrateKbps: 63 }], ['mp4', { bitrateKbps: 100001 }], ['webm', { output: '/input/overwrite' }], ['mp4', null], ['mp4', []]]) assert.throws(() => normalizeVideoEncoding(settings, 'video', format));
  for (const [mode, format] of [['still', 'png'], ['sequence', 'png'], ['audio', 'wav'], ['video', 'mov'], ['video', 'gif']]) assert.throws(() => normalizeVideoEncoding({}, mode, format));
  const request = validateRequest({ version: 1, mode: 'video', width: 160, height: 90, fps: 30, durationInFrames: 6, entrypoint: 'main.tsx', input: {}, videoEncoding: { crf: 8, preset: 'fast' } });
  assert.deepEqual(validateRequest(request), request);
});

test('encoding arguments bind requested values without relaxing fixed limits or alpha output', () => {
  assert.deepEqual(videoEncodingArgs('mp4', { crf: 8, preset: 'slow' }), ['-c:v', 'libx264', '-threads', '1', '-preset', 'slow', '-crf', '8', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']);
  const webm = videoEncodingArgs('webm', { bitrateKbps: 1000, cpuUsed: 8 });
  assert.ok(webm.includes('1000k')); assert.ok(webm.includes('yuva420p')); assert.ok(webm.includes('alpha_mode=1')); assert.equal(webm.includes('-crf'), false);
  assert.ok(webm.includes('+bitexact')); assert.ok(videoEncodingArgs('webm').includes('+bitexact'));
  assert.deepEqual(videoEncodingArgs('mp4'), ['-c:v', 'libx264', '-threads', '1', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']);
});
