import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameAudioCollector, loopAudioSamples, loopAudioClock, validateFrameAudio, assertLoopAudioBudget } from './frame-audio.mjs';
import { videoSourceAudioSample } from './video-source-audio.mjs';
import { audioPlan, audioTrackFilters, validateSoundtrackProbe } from './audio.mjs';
import { validateRequest } from './request.mjs';

const entry = { file: 'clip.mp4', audioDurations: [.15] };
const sample = (time, change = {}) => videoSourceAudioSample(entry, { id: 'video1', time, duration: .15, repeat: true, speed: 1, volume: .5, audioStream: 0, fps: 30, ...change });
const request = { version: 1, mode: 'video', format: 'mov', width: 128, height: 72, fps: 30, durationInFrames: 600, entrypoint: 'main.tsx', input: {}, frameRange: [0,599], compositionAudio: true, audioTracks: [] };

test('a half-frame loop repeats as one continuous sample-clock interval, without accumulating intervals', () => {
  const collector = new FrameAudioCollector(request);
  for (let frame = 0; frame < 600; frame++) collector.capture(frame, [sample((1 + frame) / 30)]);
  const tracks = collector.finish();
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].sourceLoopSeconds, .15);
  assert.equal(tracks[0].sourceStartSeconds, 1 / 30);
  assert.equal(tracks[0].volumeSamples.length, 600);
  const [plan] = audioPlan({ ...request, audioTracks: tracks });
  assert.equal(plan.duration, 20); assert.equal(plan.sourceDuration, 20);
  assert.match(audioTrackFilters(plan, 30), /atrim=end=0\.15,apad,atrim=end_sample=7200,aloop=loop=-1:size=7200,asetpts=N\/SR\/TB,atrim=start=0\.03333333333333333:duration=20/);
  assert.doesNotThrow(() => validateSoundtrackProbe({ streams: [{ codec_type: 'audio', sample_rate: 48000, channels: 1, duration: .15 }] }, plan));
});

test('a range export starts at its absolute loop phase and retains frame-driven gain', () => {
  const ranged = { ...request, frameRange: [7,15] };
  const collector = new FrameAudioCollector(ranged);
  for (let frame = 7; frame <= 15; frame++) collector.capture(frame, [sample((1 + frame) / 30, { volume: frame < 10 ? .25 : 1 })]);
  const [track] = collector.finish();
  const [plan] = audioPlan({ ...ranged, audioTracks: [track] });
  assert.ok(Math.abs(plan.sourceStart - 7 / 60) < 1e-12);
  assert.equal(plan.delaySamples, 0); assert.equal(plan.duration, .3);
  assert.deepEqual(track.volumeSamples, [.25,.25,.25,1,1,1,1,1,1]);
});

test('a source shorter than its video preserves the silent tail inside each loop', () => {
  const short = { ...entry, audioDurations: [.05] };
  const current = videoSourceAudioSample(short, { id: 'video1', time: .1, duration: .15, repeat: true, speed: 1, volume: 1, audioStream: 0, fps: 30 });
  assert.equal(current.sourceSeconds, .1); assert.equal(current.sourceEndSeconds, .05);
  assert.equal(current.sourceLoopSeconds, .15);
  assert.doesNotThrow(() => validateFrameAudio(current));
});

test('loops retain a strict sample period, valid private bounds and unchanged public request authority', () => {
  assert.equal(loopAudioSamples(.15), 7200); assert.equal(loopAudioSamples(1.015), 48720);
  for (const value of [0,NaN,Infinity,121,.150001]) assert.throws(() => loopAudioSamples(value));
  const valid = sample(0);
  for (const change of [{ sourceTimebase: undefined }, { sourceSeconds: .15 }, { sourceEndSeconds: .2 }, { sourceLoopSeconds: .150001 }]) assert.throws(() => validateFrameAudio({ ...valid, ...change }));
  const normalized = validateRequest({ ...request, audioTracks: [{ file: 'clip.mp4', sourceLoopSeconds: .15, sourceTimebase: 'container' }] });
  assert.equal(normalized.audioTracks[0].sourceLoopSeconds, undefined);
  assert.equal(normalized.audioTracks[0].sourceTimebase, undefined);
});
test('NTSC and uncommon frame periods keep an exact bounded intermediate sample clock', () => {
  for (const seconds of [1001/30000, 3003/30000, 1001/60000, 1/15360, 7/90000, 2/7]) {
    const clock = loopAudioClock(seconds);
    assert.ok(Number.isInteger(clock.sampleRate) && clock.sampleRate >= 48000 && clock.sampleRate <= 192000);
    assert.ok(Number.isSafeInteger(clock.samples) && clock.samples > 0);
    assert.ok(Math.abs(clock.samples / clock.sampleRate - seconds) < 1e-14);
  }
  assert.deepEqual(loopAudioClock(.1001), { sampleRate:50000, samples:5005 });
  assert.deepEqual(loopAudioClock(.15), { sampleRate:48000, samples:7200 });
});

test('loop PCM caches are bounded individually and across all soundtrack intervals', () => {
  assert.equal(assertLoopAudioBudget([{ sourceLoopSeconds: .15 }, {}]), 7200 * 8);
  assert.throws(() => assertLoopAudioBudget([{ sourceLoopSeconds: 119 + 1 / 90000 }]), /64 MiB/);
  assert.doesNotThrow(() => assertLoopAudioBudget(Array.from({ length: 2 }, () => ({ sourceLoopSeconds: 120 }))));
  assert.throws(() => assertLoopAudioBudget(Array.from({ length: 3 }, () => ({ sourceLoopSeconds: 120 }))), /128 MiB/);
  const collector = new FrameAudioCollector(request);
  const descriptors = Array.from({ length: 3 }, (_, i) => ({ ...sample(0), id: `long${i}`, sourceLoopSeconds: 120 }));
  assert.throws(() => collector.capture(0, descriptors), /128 MiB/);
  const track = { ...sample(0), startFrame: 0, endFrame: 600, sourceStartSeconds: 0, sourceLoopSeconds: 120 };
  assert.throws(() => audioPlan({ ...request, audioTracks: [track,track,track] }), /128 MiB/);
  const [plan] = audioPlan({ ...request, audioTracks: [track] });
  assert.match(audioTrackFilters(plan, 30), /aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=/);
});
