import { PRIVATE_AUDIO_FILE, validateFrameAudio } from './frame-audio.mjs';

/** Data only. The caller probes imported private files inside the container. */
export function videoAudioCatalogEntry(file, bytes, probe) {
  if (typeof file !== 'string' || file.length > 200 || !PRIVATE_AUDIO_FILE.test(file) || !/\.(mp4|webm)$/i.test(file) || !bytes?.length || bytes.length > 20 * 1024 * 1024) throw new Error('Invalid private video soundtrack import.');
  const streams = Array.isArray(probe?.streams) ? probe.streams.filter((stream) => stream.codec_type === 'audio') : [];
  if (streams.length > 8) throw new Error('Private video has too many audio streams.');
  const audioDurations = streams.map((stream) => {
    const duration = Number(stream.duration) > 0 ? Number(stream.duration) : Number(probe?.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 120 || !Number.isInteger(Number(stream.channels)) || Number(stream.channels) < 1 || Number(stream.channels) > 8 || !Number.isFinite(Number(stream.sample_rate)) || Number(stream.sample_rate) < 1 || Number(stream.sample_rate) > 192000) throw new Error('Private video soundtrack exceeds decode limits.');
    return duration;
  });
  return { file, src: `data:video/${file.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'};base64,${Buffer.from(bytes).toString('base64')}`, audioDurations };
}

/** Forward, frame-driven sound; the source-tail remainder becomes silence. */
export function videoSourceAudioSample(entry, { id, time, duration, repeat, speed, volume, audioStream, fps }) {
  if (!entry || !Array.isArray(entry.audioDurations) || !Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0 || duration > 120 || typeof repeat !== 'boolean' || !Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('Invalid private video sound clock.');
  if (!entry.audioDurations.length) return null;
  if (!Number.isInteger(audioStream) || audioStream < 0 || audioStream >= entry.audioDurations.length) throw new Error('Requested video audio stream is unavailable.');
  if (repeat && (Math.abs(duration * fps / speed - Math.round(duration * fps / speed)) > .01 || Math.abs(time * fps / speed - Math.round(time * fps / speed)) > .01)) throw new Error('Repeating source sound requires frame-aligned duration, speed and phase.');
  const sourceSeconds = repeat ? time % duration : time;
  const sourceEndSeconds = Math.min(duration, entry.audioDurations[audioStream]);
  if (sourceSeconds >= sourceEndSeconds) return null;
  return validateFrameAudio({ id, file: entry.file, sourceSeconds, sourceEndSeconds, speed, volume, audioStream });
}
