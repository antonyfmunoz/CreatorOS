// Browser-authored descriptors are untrusted data, not host callbacks or URLs.
import { videoSourceTime } from './media-clock.mjs';
export const PRIVATE_AUDIO_FILE = /^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(wav|mp3|flac|ogg|mp4|webm)$/i;

export function loopAudioClock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) throw new Error('Invalid private audio loop duration.');
  // Find the exact media period's small rational clock. NTSC and VFR periods
  // need not land on the 48 kHz output grid. Loop on a bounded intermediate
  // sample rate, then resample the continuous stream once; rounding every
  // cycle to output samples would accumulate A/V drift.
  const tolerance = Number.EPSILON * Math.max(1, seconds) * 8;
  let value = seconds, previousNumerator = 0, numerator = 1, previousDenominator = 1, denominator = 0;
  for (let step = 0; step < 32; step++) {
    const whole = Math.floor(value), nextNumerator = whole * numerator + previousNumerator, nextDenominator = whole * denominator + previousDenominator;
    if (!Number.isSafeInteger(nextNumerator) || !Number.isSafeInteger(nextDenominator) || nextDenominator > 192000) break;
    if (nextNumerator > 0 && Math.abs(nextNumerator / nextDenominator - seconds) <= tolerance) {
      const multiple = Math.ceil(48000 / nextDenominator), sampleRate = nextDenominator * multiple, samples = nextNumerator * multiple;
      if (sampleRate >= 48000 && sampleRate <= 192000 && samples >= 1) return { sampleRate, samples };
    }
    previousNumerator = numerator; numerator = nextNumerator; previousDenominator = denominator; denominator = nextDenominator;
    const remainder = value - whole;
    if (remainder === 0) break;
    value = 1 / remainder;
  }
  throw new Error('Private audio loop period exceeds the bounded resampling clock.');
}
export function loopAudioSamples(seconds) { return loopAudioClock(seconds).samples; }

// The loop filter is explicitly negotiated to stereo float32 before caching.
// Bound retained PCM separately from the container's total-memory enforcement;
// input decoder buffers, resampling and the renderer still need headroom.
export function assertLoopAudioBudget(tracks) {
  let total = 0;
  for (const track of tracks) {
    if (track.sourceLoopSeconds === undefined) continue;
    const bytes = loopAudioClock(track.sourceLoopSeconds).samples * 2 * 4;
    if (bytes > 64 * 1024 * 1024) throw new Error('Private audio loop exceeds the 64 MiB PCM cache limit.');
    total += bytes;
    if (total > 128 * 1024 * 1024) throw new Error('Private audio loops exceed the combined 128 MiB PCM cache limit.');
  }
  return total;
}

export function validateFrameAudio(sample) {
  if (sample?.sourceLoopSeconds !== undefined) {
    loopAudioSamples(sample.sourceLoopSeconds);
    if (sample.sourceTimebase !== 'container' || sample.sourceSeconds >= sample.sourceLoopSeconds || sample.sourceEndSeconds === undefined || sample.sourceEndSeconds > sample.sourceLoopSeconds) throw new Error('Invalid private video loop binding.');
  }
  if (!sample || typeof sample !== 'object' || typeof sample.id !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(sample.id)
    || typeof sample.file !== 'string' || sample.file.length > 200 || !PRIVATE_AUDIO_FILE.test(sample.file)
    || !Number.isFinite(sample.sourceSeconds) || sample.sourceSeconds < 0 || sample.sourceSeconds >= 120
    || (sample.sourceTimebase !== undefined && (sample.sourceTimebase !== 'container' || !/\.(mp4|webm)$/i.test(sample.file)))
    || (sample.sourceEndSeconds !== undefined && (!Number.isFinite(sample.sourceEndSeconds) || sample.sourceEndSeconds <= (sample.sourceLoopSeconds === undefined ? sample.sourceSeconds : 0) || sample.sourceEndSeconds > 120))
    || !Number.isFinite(sample.speed) || sample.speed < .5 || sample.speed > 2
    || !Number.isFinite(sample.volume) || sample.volume < 0 || sample.volume > 2
    || !Number.isInteger(sample.audioStream) || sample.audioStream < 0 || sample.audioStream > 7) throw new Error('Invalid private frame soundtrack.');
  return { id: sample.id, file: sample.file, sourceSeconds: sample.sourceSeconds, ...(sample.sourceTimebase === undefined ? {} : { sourceTimebase: sample.sourceTimebase }), ...(sample.sourceEndSeconds === undefined ? {} : { sourceEndSeconds: sample.sourceEndSeconds }), ...(sample.sourceLoopSeconds === undefined ? {} : { sourceLoopSeconds: sample.sourceLoopSeconds }), speed: sample.speed, volume: sample.volume, audioStream: sample.audioStream };
}

export class FrameAudioCollector {
  constructor(request) {
    this.request = request;
    this.tracks = [];
    this.active = new Map();
    this.nextFrame = request.frameRange[0];
  }

  capture(frame, descriptors) {
    const { request } = this;
    if (frame !== this.nextFrame || frame > request.frameRange[1] || !Array.isArray(descriptors) || descriptors.length > 8) throw new Error('Invalid frame soundtrack collection.');
    this.nextFrame++;
    const seen = new Set();
    const active = new Map();
    for (const descriptor of descriptors) {
      const sample = validateFrameAudio(descriptor);
      if (seen.has(sample.id)) throw new Error('Duplicate frame soundtrack identity.');
      seen.add(sample.id);
      let track = this.active.get(sample.id);
      const expectedTime = track ? track.sourceStartSeconds + (frame - track.startFrame) * track.speed / request.fps : 0;
      const expectedSource = track?.sourceLoopSeconds === undefined ? expectedTime : videoSourceTime(expectedTime, track.sourceLoopSeconds, true);
      // Repeat/conditional mount/source changes become new bounded intervals.
      // Range exports start at the actual local source clock, never at zero.
      if (!track || track.file !== sample.file || track.audioStream !== sample.audioStream || track.speed !== sample.speed || track.sourceEndSeconds !== sample.sourceEndSeconds || track.sourceTimebase !== sample.sourceTimebase || track.sourceLoopSeconds !== sample.sourceLoopSeconds
        || Math.abs(expectedSource - sample.sourceSeconds) > 1e-8) {
        if (this.tracks.length + request.audioTracks.length >= 8) throw new Error('At most eight combined explicit and composition soundtrack intervals are supported.');
        track = { file: sample.file, startFrame: frame, endFrame: frame + 1, sourceStartSeconds: sample.sourceSeconds, ...(sample.sourceTimebase === undefined ? {} : { sourceTimebase: sample.sourceTimebase }), ...(sample.sourceEndSeconds === undefined ? {} : { sourceEndSeconds: sample.sourceEndSeconds }), ...(sample.sourceLoopSeconds === undefined ? {} : { sourceLoopSeconds: sample.sourceLoopSeconds }), speed: sample.speed, volume: 1, audioStream: sample.audioStream, volumeSamples: [] };
        assertLoopAudioBudget([...request.audioTracks, ...this.tracks, track]);
        this.tracks.push(track);
      }
      track.endFrame = frame + 1;
      track.volumeSamples.push(sample.volume);
      active.set(sample.id, track);
    }
    this.active = active;
  }

  finish() {
    if (this.nextFrame !== this.request.frameRange[1] + 1) throw new Error('Incomplete frame soundtrack collection.');
    return this.tracks;
  }
}

// A balanced expression keeps parser depth logarithmic even for 600 samples.
// Numeric values only; no authored expression or path enters this filter.
export function frameVolumeExpression(samples, fps, localStartFrame = 0) {
  if (!Array.isArray(samples) || !samples.length || samples.length > 600 || samples.some((value) => !Number.isFinite(value) || value < 0 || value > 2)
    || !Number.isInteger(fps) || fps < 1 || fps > 60 || !Number.isInteger(localStartFrame) || localStartFrame < 0) throw new Error('Invalid frame soundtrack envelope.');
  const build = (first, last) => {
    if (samples.slice(first, last).every((value) => value === samples[first])) return String(samples[first]);
    const mid = Math.floor((first + last) / 2);
    return `if(lt(t*${fps}+${localStartFrame},${mid}),${build(first, mid)},${build(mid, last)})`;
  };
  return build(0, samples.length);
}
