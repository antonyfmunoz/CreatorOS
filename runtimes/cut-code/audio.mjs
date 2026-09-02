import { writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MAX_ARTIFACT_BYTES, outputContract } from './request.mjs';
const execute = promisify(execFile);

export function audioPlan(request) {
  const output = outputContract(request);
  return request.audioTracks.flatMap((track) => {
    const start = Math.max(track.startFrame, output.start);
    const end = Math.min(track.endFrame, output.end + 1);
    if (end <= start) return [];
    return [{ ...track, sourceStart: track.sourceStartSeconds + (start - track.startFrame) * track.speed / request.fps, sourceDuration: (end - start) * track.speed / request.fps, duration: (end - start) / request.fps, delaySamples: Math.round((start - output.start) * 48000 / request.fps) }];
  });
}

// Container-only media work. File names, decoders and process arguments are
// owned by the runtime, never interpreted as commands or provider URLs.
export async function mixAudioTracks(request, capsule, inputVideo, outputVideo) {
  for (const track of request.audioTracks) if (!capsule[track.file]?.length) throw new Error('A private soundtrack file is missing.');
  const plan = audioPlan(request);
  if (!plan.length) return 0;
  const args = ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', inputVideo];
  const filters = [];
  for (let index = 0; index < plan.length; index++) {
    const track = plan[index];
    const extension = track.file.split('.').at(-1).toLowerCase();
    const filename = `/tmp/soundtrack-${index}.${extension}`;
    await writeFile(filename, capsule[track.file], { flag: 'wx' });
    const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', extension, '-show_entries', 'stream=codec_type,sample_rate,channels:format=duration', '-of', 'json', filename], { timeout: 8000, maxBuffer: 16384 })).stdout);
    const streams = probe.streams.filter((stream) => stream.codec_type === 'audio');
    const seconds = Number(probe.format.duration);
    if (streams.length !== 1 || !Number.isFinite(Number(streams[0].sample_rate)) || Number(streams[0].sample_rate) < 1 || Number(streams[0].sample_rate) > 192000 || !Number.isInteger(Number(streams[0].channels)) || Number(streams[0].channels) < 1 || Number(streams[0].channels) > 8 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 120 || track.sourceStart + track.sourceDuration > seconds + .01) throw new Error('A soundtrack exceeds its decode or source timing limits.');
    args.push('-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', extension, '-i', filename);
    filters.push(`[${index + 1}:a:0]atrim=start=${track.sourceStart}:duration=${track.sourceDuration},asetpts=PTS-STARTPTS,atempo=${track.speed},volume=${track.volume},aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${track.duration},adelay=${track.delaySamples}S:all=1[a${index}]`);
  }
  const duration = outputContract(request).frames / request.fps;
  filters.push(`${plan.map((_, index) => `[a${index}]`).join('')}amix=inputs=${plan.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95:level=false:latency=true,apad,atrim=duration=${duration}[mix]`);
  args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-threads', '1', '-t', String(duration), '-movflags', '+faststart', '-fs', String(MAX_ARTIFACT_BYTES), outputVideo);
  await execute('ffmpeg', args, { timeout: 20_000, maxBuffer: 16384 });
  if ((await stat(outputVideo)).size >= MAX_ARTIFACT_BYTES) throw new Error('Soundtrack output exceeds the artifact limit.');
  return plan.length;
}
