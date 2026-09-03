import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from './request.mjs';
import { audioPlan, volumeAutomationFilter, soundtrackInputOptions, validateSoundtrackProbe } from './audio.mjs';
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
test('bounded gain keyframes use the track clock and preserve normalized legacy requests', () => {
  const legacy = validateRequest({ ...base, audioTracks: [{ file: 'music.wav' }] });
  assert.equal('volumeKeyframes' in legacy.audioTracks[0], false);
  const request = validateRequest({ ...base, frameRange: [20, 39], audioTracks: [{ file: 'music.wav', startFrame: 5, endFrame: 50, speed: 2, volume: .5, volumeKeyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 1, interpolation: 'hold' }, { frame: 45, value: .2 }] }] });
  assert.deepEqual(validateRequest(request), request);
  const [track] = audioPlan(request);
  assert.equal(track.localStartFrame, 15);
  assert.equal(track.sourceStart, 1);
  assert.equal(track.delaySamples, 0);
  const filter = volumeAutomationFilter(track, request.fps);
  assert.ok(filter.startsWith("aeval=exprs='val(0)*(0.5*"));
  assert.ok(filter.includes('(n*30+720000)'));
  assert.ok(filter.includes('if(lt((n*30+720000),2160000),1,0.2)'));
  assert.equal(volumeAutomationFilter(audioPlan(legacy)[0], 30), 'volume=1');
});
test('gain automation rejects malformed points, expressions and unbounded work', () => {
  for (const volumeKeyframes of [[], null, 't', [{ frame: -1, value: 1 }], [{ frame: 61, value: 1 }], [{ frame: .5, value: 1 }], [{ frame: 0, value: -1 }], [{ frame: 0, value: 3 }], [{ frame: 0, value: NaN }], [{ frame: 0, value: '1;movie=/etc/passwd' }], [{ frame: 0, value: 1, interpolation: 'unknown' }], [{ frame: 2, value: 1 }, { frame: 1, value: 1 }], [{ frame: 1, value: 1 }, { frame: 1, value: 0 }], Array.from({ length: 33 }, (_, frame) => ({ frame, value: 1 }))]) {
    assert.throws(() => validateRequest({ ...base, audioTracks: [{ file: 'a.wav', volumeKeyframes }] }));
  }
  const keys = Array.from({ length: 32 }, (_, frame) => ({ frame, value: frame % 2 }));
  assert.equal(validateRequest({ ...base, audioTracks: [{ file: 'a.wav', volumeKeyframes: keys }] }).audioTracks[0].volumeKeyframes.length, 32);
});
test('audio admission rejects external files, unsupported decoders and unbounded timing', () => {
  for (const track of [{ file: '../sound.wav' }, { file: 'https://example.com/a.wav' }, { file: 'sound.m3u8' }, { file: 'sound.wav', startFrame: -1 }, { file: 'sound.wav', endFrame: 61 }, { file: 'sound.wav', startFrame: 2, endFrame: 2 }, { file: 'sound.wav', sourceStartSeconds: 120 }, { file: 'sound.wav', speed: 0 }, { file: 'sound.wav', volume: 3 }]) assert.throws(() => validateRequest({ ...base, audioTracks: [track] }));
  assert.throws(() => validateRequest({ ...base, mode: 'still', audioTracks: [{ file: 'a.wav' }] }));
  assert.throws(() => validateRequest({ ...base, audioTracks: Array.from({ length: 9 }, () => ({ file: 'a.wav' })) }));
});
test('video soundtrack admission pins demuxers, denies external references and selects bounded audio streams', () => {
  assert.deepEqual(soundtrackInputOptions('clip.MP4'), ['-protocol_whitelist', 'file,pipe', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0']);
  assert.deepEqual(soundtrackInputOptions('clip.webm'), ['-protocol_whitelist', 'file,pipe', '-f', 'matroska']);
  assert.throws(() => soundtrackInputOptions('playlist.m3u8'));
  for (const audioStream of [-1, 8, .5, '0', NaN]) assert.throws(() => validateRequest({ ...base, audioTracks: [{ file: 'clip.mp4', audioStream }] }));
  const request = validateRequest({ ...base, audioTracks: [{ file: 'clip.mp4', audioStream: 1 }] });
  assert.deepEqual(validateRequest(request), request);
  const [track] = audioPlan(request);
  const first = { codec_type: 'audio', channels: 2, sample_rate: '48000', duration: '3' };
  const second = { codec_type: 'audio', channels: 1, sample_rate: '44100', duration: '2' };
  const probe = { streams: [{ codec_type: 'video' }, first, second], format: { duration: '120' } };
  assert.equal(validateSoundtrackProbe(probe, track), second);
  for (const bad of [{ streams: [] }, { streams: [first], format: { duration: 4 } }, { ...probe, streams: [first, { ...second, duration: '1' }] }, { ...probe, streams: [first, { ...second, channels: 16 }] }, { ...probe, streams: Array(9).fill(first) }]) assert.throws(() => validateSoundtrackProbe(bad, track));
});
