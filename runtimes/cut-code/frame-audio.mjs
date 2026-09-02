// Browser-authored descriptors are untrusted data, not host callbacks or URLs.
export const PRIVATE_AUDIO_FILE = /^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(wav|mp3|flac|ogg|mp4|webm)$/i;

export function validateFrameAudio(sample) {
  if (!sample || typeof sample !== 'object' || typeof sample.id !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(sample.id)
    || typeof sample.file !== 'string' || sample.file.length > 200 || !PRIVATE_AUDIO_FILE.test(sample.file)
    || !Number.isFinite(sample.sourceSeconds) || sample.sourceSeconds < 0 || sample.sourceSeconds >= 120
    || (sample.sourceEndSeconds !== undefined && (!Number.isFinite(sample.sourceEndSeconds) || sample.sourceEndSeconds <= sample.sourceSeconds || sample.sourceEndSeconds > 120))
    || !Number.isFinite(sample.speed) || sample.speed < .5 || sample.speed > 2
    || !Number.isFinite(sample.volume) || sample.volume < 0 || sample.volume > 2
    || !Number.isInteger(sample.audioStream) || sample.audioStream < 0 || sample.audioStream > 7) throw new Error('Invalid private frame soundtrack.');
  return { id: sample.id, file: sample.file, sourceSeconds: sample.sourceSeconds, ...(sample.sourceEndSeconds === undefined ? {} : { sourceEndSeconds: sample.sourceEndSeconds }), speed: sample.speed, volume: sample.volume, audioStream: sample.audioStream };
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
      // Repeat/conditional mount/source changes become new bounded intervals.
      // Range exports start at the actual local source clock, never at zero.
      if (!track || track.file !== sample.file || track.audioStream !== sample.audioStream || track.speed !== sample.speed || track.sourceEndSeconds !== sample.sourceEndSeconds
        || Math.abs(track.sourceStartSeconds + (frame - track.startFrame) * track.speed / request.fps - sample.sourceSeconds) > 1e-8) {
        if (this.tracks.length + request.audioTracks.length >= 8) throw new Error('At most eight combined explicit and composition soundtrack intervals are supported.');
        track = { file: sample.file, startFrame: frame, endFrame: frame + 1, sourceStartSeconds: sample.sourceSeconds, ...(sample.sourceEndSeconds === undefined ? {} : { sourceEndSeconds: sample.sourceEndSeconds }), speed: sample.speed, volume: 1, audioStream: sample.audioStream, volumeSamples: [] };
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
