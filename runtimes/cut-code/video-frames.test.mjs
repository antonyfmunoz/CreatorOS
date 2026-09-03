import test from 'node:test';
import assert from 'node:assert/strict';
import { videoFrameIndex, selectVideoFrame, PrivateVideoFrames } from './video-frames.mjs';

const probe = () => ({ streams: [{ width: 320, height: 180, time_base: '1/1000', codec_name: 'h264' }], format: { start_time: '0', duration: '.6' }, frames: [0, 100, 200, 300, 400, 500].map(best_effort_timestamp => ({ best_effort_timestamp })) });
test('indexed private video preserves exact loop boundaries and distinct nearby times', () => {
  const index = videoFrameIndex(probe());
  for (let f = 0; f < 120; f++) assert.equal(selectVideoFrame(index, (2 + f * 2) / 10, true), (2 + f * 2) % 6);
  assert.equal(selectVideoFrame(index, .3 - 1e-9, false), 2);
  assert.equal(selectVideoFrame(index, .3, false), 3);
  assert.equal(selectVideoFrame(index, 30, false), 5);
});
test('private video frame selection follows variable presentation intervals and origin', () => {
  const input = probe();
  input.format.start_time = '5';
  input.frames = [5000, 5070, 5240, 5490].map(best_effort_timestamp => ({ best_effort_timestamp }));
  const index = videoFrameIndex(input);
  assert.deepEqual([0, .069, .07, .239, .24, .5, .6].map(t => selectVideoFrame(index, t, true)), [0,0,1,1,2,3,0]);
});
test('the final decoded presentation interval cannot be truncated by VFR header duration', () => {
  const input = probe();
  input.format.duration = '.4';
  input.frames.at(-1).pkt_duration = 100;
  const index = videoFrameIndex(input);
  assert.equal(index.duration, .6);
  assert.equal(selectVideoFrame(index, .5, true), 5);
});
test('an absolute MP4 header end is not an extended relative video duration', () => {
  const input = probe();
  input.format = { start_time: '5', duration: '5.6' };
  input.frames.forEach(frame => { frame.best_effort_timestamp += 5000; frame.duration = 100; });
  const index = videoFrameIndex(input);
  assert.ok(Math.abs(index.duration - .6) < 1e-12);
  assert.equal(selectVideoFrame(index, .6, true), 0);
});

test('VP9 alpha metadata remains valid across case-preserving WebM muxers', () => {
  for (const name of ['alpha_mode', 'ALPHA_MODE', 'Alpha_Mode']) {
    const input = probe(); input.streams[0].codec_name = 'vp9'; input.streams[0].tags = { [name]: '1' };
    assert.equal(videoFrameIndex(input).alpha, true);
    input.streams[0].tags[name] = '0'; assert.equal(videoFrameIndex(input).alpha, false);
  }
});
test('private video rejects ambiguous, unbounded or malformed metadata and bindings', async () => {
  for (const modify of [p=>p.frames[1].best_effort_timestamp=0,p=>p.frames[0].best_effort_timestamp='bad',p=>p.format.duration=121,p=>p.streams[0].width=100000,p=>p.streams[0].time_base='1/0',p=>p.frames=[]]) {
    const input = probe(); modify(input); assert.throws(() => videoFrameIndex(input));
  }
  const videos = new PrivateVideoFrames([], {});
  await assert.rejects(videos.frame(-1, 0, false));
  await assert.rejects(videos.frame('0', 0, false));
  assert.throws(() => new PrivateVideoFrames(Array(9).fill('a.mp4'), { 'a.mp4': Buffer.from([1]) }));
});
