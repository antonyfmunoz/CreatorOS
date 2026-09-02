// Container-only, bounded private-file decoding. Authored JavaScript never gets
// a process, path, command, filesystem API, or general-purpose host callback.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { soundtrackInputOptions } from './audio.mjs';
import { videoSourceTime } from './media-clock.mjs';

const execute = promisify(execFile);
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_FRAMES = 36000;

export function videoFrameIndex(probe) {
  const stream = probe?.streams?.[0];
  const ratio = typeof stream?.time_base === 'string' && /^(\d+)\/(\d+)$/.exec(stream.time_base);
  const tick = ratio ? Number(ratio[1]) / Number(ratio[2]) : NaN;
  const origin = Number(probe?.format?.start_time ?? stream?.start_time ?? 0);
  let duration = Number(probe?.format?.duration ?? stream?.duration);
  const width = Number(stream?.width), height = Number(stream?.height);
  if (!Number.isFinite(tick) || tick <= 0 || tick > 1 || !Number.isFinite(origin) || Math.abs(origin) > 120 || !Number.isFinite(duration) || duration <= 0 || duration > 120 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 3840 * 2160) throw new Error('Private video exceeds decode limits.');
  const frames = probe?.frames;
  if (!Array.isArray(frames) || !frames.length || frames.length > MAX_FRAMES) throw new Error('Private video frame index exceeds its limit.');
  const pts = frames.map((frame) => Number(frame.best_effort_timestamp));
  if (pts.some((value, i) => !Number.isSafeInteger(value) || Math.abs(value * tick - origin) > 120 || (i > 0 && value <= pts[i - 1]))) throw new Error('Private video needs strictly ordered presentation timestamps.');
  // Some VFR/B-frame containers report a shorter header duration than their
  // actual final presented frame. Do not wrap while that frame is still due.
  const lastFrame = frames.at(-1);
  const lastDuration = Number(lastFrame.duration ?? lastFrame.pkt_duration ?? 0);
  if (!Number.isSafeInteger(lastDuration) || lastDuration < 0) throw new Error('Invalid private video frame duration.');
  // The decoded video-stream endpoint also avoids treating an absolute MP4
  // header end (e.g. offset 5 + length 1) as six seconds of source playback.
  if (lastDuration > 0) {
    let originTicks = origin / tick;
    if (Math.abs(originTicks - Math.round(originTicks)) <= Number.EPSILON * Math.max(1, Math.abs(originTicks)) * 4) originTicks = Math.round(originTicks);
    duration = (pts.at(-1) + lastDuration - originTicks) * tick;
  }
  if (duration > 120 || duration <= pts.at(-1) * tick - origin) throw new Error('Private video presentation endpoint is unavailable or unbounded.');
  return { pts, tick, origin, duration, codec: stream.codec_name, alpha: stream.tags?.alpha_mode === '1' };
}

export function selectVideoFrame(index, time, repeat) {
  const target = videoSourceTime(time, index.duration, repeat) + index.origin;
  // Pick the frame whose presentation interval contains the requested time,
  // not the nearest frame or a synthetic constant-FPS index. Snap roundoff only.
  const roundoff = Number.EPSILON * Math.max(Math.abs(target), index.duration) * 8;
  let low = 0, high = index.pts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (index.pts[middle] * index.tick <= target + roundoff) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export class PrivateVideoFrames {
  #entries = [];
  #cache = new Map();
  #cacheBytes = 0;
  constructor(files, capsule) {
    if (files.length > 8) throw new Error('At most eight private video imports are supported per render.');
    this.#entries = files.map((file) => {
      const bytes = capsule[file];
      if (!/\.(mp4|webm)$/i.test(file) || !bytes?.length || bytes.length > 20 * 1024 * 1024) throw new Error('Invalid private video import.');
      return { file, bytes, src: `data:video/${file.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'};base64,${Buffer.from(bytes).toString('base64')}` };
    });
  }
  get sources() { return this.#entries.map((entry) => entry.src); }
  async frame(importIndex, time, repeat) {
    if (!Number.isInteger(importIndex) || importIndex < 0 || importIndex >= this.#entries.length || !Number.isFinite(time) || time < 0 || typeof repeat !== 'boolean') throw new Error('Invalid private video frame request.');
    const entry = this.#entries[importIndex];
    if (!entry.index) {
      entry.path = `/tmp/video-frames-${importIndex}.${entry.file.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'}`;
      await writeFile(entry.path, entry.bytes, { flag: 'wx' });
      const probe = await execute('ffprobe', ['-v', 'error', '-threads', '1', ...soundtrackInputOptions(entry.file), '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp,duration,pkt_duration:stream=codec_name,width,height,time_base,start_time,duration:stream_tags=alpha_mode:format=start_time,duration', '-of', 'json', entry.path], { timeout: 8_000, maxBuffer: 4 * 1024 * 1024 });
      entry.index = videoFrameIndex(JSON.parse(probe.stdout));
    }
    const frame = selectVideoFrame(entry.index, time, repeat);
    const key = `${importIndex}:${frame}`;
    let png = this.#cache.get(key);
    if (!png) {
      const pts = entry.index.pts[frame];
      // Seek before the selected frame, retaining the original PTS. The exact
      // integer selection below is authoritative, including B-frame ordering.
      const seek = Math.max(entry.index.pts[0] * entry.index.tick, pts * entry.index.tick - .1);
      const decoder = entry.index.alpha && entry.index.codec === 'vp9' ? ['-c:v', 'libvpx-vp9'] : [];
      const result = await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-filter_threads', '1', '-copyts', '-seek_timestamp', '1', '-ss', String(seek), ...soundtrackInputOptions(entry.file), ...decoder, '-i', entry.path, '-map', '0:v:0', '-an', '-sn', '-dn', '-vf', `select=eq(pts\\,${pts})`, '-frames:v', '1', '-fps_mode', 'passthrough', '-c:v', 'png', '-threads', '1', '-pix_fmt', 'rgba', '-f', 'image2pipe', 'pipe:1'], { timeout: 8_000, maxBuffer: MAX_CACHE_BYTES, encoding: 'buffer' });
      png = result.stdout;
      if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.readUInt32BE(16) * png.readUInt32BE(20) > 3840 * 2160) throw new Error('Private video did not decode its selected frame.');
      while (this.#cacheBytes + png.length > MAX_CACHE_BYTES && this.#cache.size) {
        const oldest = this.#cache.keys().next().value;
        this.#cacheBytes -= this.#cache.get(oldest).length;
        this.#cache.delete(oldest);
      }
      this.#cache.set(key, png);
      this.#cacheBytes += png.length;
    }
    return { png: `data:image/png;base64,${png.toString('base64')}`, duration: entry.index.duration, pts: entry.index.pts[frame] };
  }
}
