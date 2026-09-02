import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { audioPlan, audioTrackFilters } from './audio.mjs';
import { validateRequest } from './request.mjs';

// Decode the same filter graph used by the isolated renderer. A generated sine
// is evidence of gain/timing, not evidence of the container security boundary.
const base = { version: 1, mode: 'video', width: 320, height: 180, fps: 30, durationInFrames: 60, entrypoint: 'index.tsx', input: {} };
const inContainer = process.argv.includes('--container');
const image = inContainer ? execFileSync('docker', ['image', 'inspect', 'creativesos-cut-code:qualification', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true }).trim() : null;
if (inContainer && !/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('A pinned qualification image is required.');
const decode = (track, extra = {}) => {
  const request = validateRequest({ ...base, ...extra, audioTracks: [{ file: 'tone.wav', ...track }] });
  const [plan] = audioPlan(request);
  const args = ['-v', 'error', '-nostdin', '-threads', '1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-af', audioTrackFilters(plan, request.fps), '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'];
  // Fixed synthetic input only: no user source, files, credentials or mounts.
  // This checks the actual image's FFmpeg, in addition to the host version.
  return execFileSync(inContainer ? 'docker' : 'ffmpeg', inContainer ? ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--cpus', '1', '--memory', '2g', '--memory-swap', '2g', '--pids-limit', '256', '--log-driver', 'none', '--entrypoint', 'ffmpeg', image, ...args] : args, { windowsHide: true, timeout: 20_000, maxBuffer: 2_000_000 });
};
const rms = (bytes, start, end) => {
  const first = Math.round(start * 48000), last = Math.round(end * 48000);
  assert.ok(last * 4 <= bytes.length && first < last, 'Requested audio window must exist.');
  let sum = 0;
  for (let sample = first; sample < last; sample++) sum += bytes.readFloatLE(sample * 4) ** 2;
  return Math.sqrt(sum / (last - first));
};
const baseline = rms(decode({}), .1, .2);
const keys = [{ frame: 0, value: 0 }, { frame: 15, value: 1 }, { frame: 30, value: 1 }, { frame: 45, value: 0 }];
const faded = decode({ startFrame: 6, volume: .5, volumeKeyframes: keys });
assert.ok(rms(faded, .02, .15) < .000001, 'No sound before the track starts.');
assert.ok(rms(faded, .22, .27) < baseline * .08, 'Fade begins quietly after the offset.');
assert.ok(rms(faded, .72, .92) > baseline * .49 && rms(faded, .72, .92) < baseline * .51, 'Keyframe gain multiplies the static track gain.');
assert.ok(rms(faded, 1.72, 1.78) < .000001, 'The final zero gain holds.');
const full = decode({ volumeKeyframes: keys });
const ranged = decode({ volumeKeyframes: keys }, { frameRange: [9, 38] });
assert.ok(Math.abs(rms(ranged, .08, .16) / rms(full, .38, .46) - 1) < .005, 'A range must continue the exact existing fade.');
const sped = decode({ speed: 2, volumeKeyframes: keys });
assert.ok(Math.abs(rms(sped, .1, .2) / rms(full, .1, .2) - 1) < .02, 'Source playback speed must not speed up the composition gain clock.');
const held = decode({ volumeKeyframes: [{ frame: 0, value: 0, interpolation: 'hold' }, { frame: 15, value: 1 }] });
assert.ok(rms(held, .4, .499) < .000001 && rms(held, .501, .6) > baseline * .99, 'Held gain changes at the keyframe, not a decoder packet boundary.');
const maximum = decode({ volumeKeyframes: Array.from({ length: 32 }, (_, frame) => ({ frame, value: frame % 2, interpolation: frame % 3 ? 'linear' : 'hold' })) });
assert.ok(rms(maximum, 1.2, 1.3) > baseline * .99, 'The maximum admitted keyframe count must actually decode and hold its endpoint.');
console.log(JSON.stringify({ passed: true, image, tests: ['offset', 'fade', 'static-gain', 'final-hold', 'range-continuity', 'speed-independent-clock', 'exact-held-edge', 'maximum-keyframes'], baselineRms: baseline, fadedRms: rms(faded, .72, .92) }));
