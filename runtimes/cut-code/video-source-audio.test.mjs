import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoAudioCatalogEntry, videoSourceAudioSample } from './video-source-audio.mjs';
import { FrameAudioCollector } from './frame-audio.mjs';
import { audioPlan, validateSoundtrackProbe } from './audio.mjs';

const probe = { streams: [{ codec_type: 'video' }, { codec_type: 'audio', duration: '2', sample_rate: '48000', channels: 2 }], format: { duration: '2' } };
const entry = videoAudioCatalogEntry('media/clip.mp4', Buffer.from([0, 1, 2]), probe);
const input = { id: 'video:r1:', time: .5, duration: 2, repeat: false, speed: 1, volume: .4, audioStream: 0, fps: 30 };

test('binds imported media bytes to capsule-local audio streams only', () => {
  assert.equal(entry.src, 'data:video/mp4;base64,AAEC');
  assert.deepEqual(entry.audioDurations, [2]);
  for (const file of ['../clip.mp4', '/clip.mp4', 'https://example.invalid/a.mp4', 'clip.wav']) assert.throws(() => videoAudioCatalogEntry(file, Buffer.from([0]), probe));
  assert.throws(() => videoAudioCatalogEntry('clip.mp4', Buffer.from([0]), { streams: [{ codec_type: 'audio', channels: 2, sample_rate: 48000, duration: 121 }] }));
  const silent = videoAudioCatalogEntry('clip.webm', Buffer.from([0]), { streams: [{ codec_type: 'video' }] });
  assert.equal(videoSourceAudioSample(silent, input), null);
});

test('follows video trim, forward speed, repeat, stream selection and source EOF', () => {
  assert.deepEqual(videoSourceAudioSample(entry, input), { id: input.id, file: 'media/clip.mp4', sourceSeconds: .5, sourceEndSeconds: 2, speed: 1, volume: .4, audioStream: 0 });
  assert.equal(videoSourceAudioSample(entry, { ...input, time: 2 }), null);
  assert.equal(videoSourceAudioSample(entry, { ...input, time: 4.5, repeat: true }).sourceSeconds, .5);
  for (const change of [{ speed: 3 }, { volume: -1 }, { audioStream: 1 }, { repeat: true, duration: 1.015 }]) assert.throws(() => videoSourceAudioSample(entry, { ...input, ...change }));
  const multistream = { ...entry, audioDurations: [2, 1] };
  assert.equal(videoSourceAudioSample(multistream, { ...input, time: 1, audioStream: 1 }), null);
});

test('pads only the fractional source tail without replaying its final sound', () => {
  const request = { mode: 'video', format: 'mp4', fps: 30, durationInFrames: 2, frameRange: [0, 1], audioTracks: [] };
  const collector = new FrameAudioCollector(request);
  const short = { ...entry, audioDurations: [.05] };
  for (let frame = 0; frame < 2; frame++) collector.capture(frame, [videoSourceAudioSample(short, { ...input, time: frame / 30 })]);
  const tracks = collector.finish();
  const plan = audioPlan({ ...request, audioTracks: tracks });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].sourceDuration, .05);
  assert.equal(plan[0].duration, 2 / 30);
  assert.doesNotThrow(() => validateSoundtrackProbe({ ...probe, streams: [{ codec_type: 'audio', sample_rate: 48000, channels: 2, duration: .05 }] }, plan[0]));
  assert.throws(() => validateSoundtrackProbe({ ...probe, streams: [{ codec_type: 'audio', sample_rate: 48000, channels: 2, duration: .01 }] }, plan[0]));
});
