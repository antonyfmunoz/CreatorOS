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
    return [{ ...track, localStartFrame: start - track.startFrame, sourceStart: track.sourceStartSeconds + (start - track.startFrame) * track.speed / request.fps, sourceDuration: (end - start) * track.speed / request.fps, duration: (end - start) / request.fps, delaySamples: Math.round((start - output.start) * 48000 / request.fps) }];
  });
}

// Only normalized numeric keyframes enter this expression. The frame clock is
// track-local after retiming; a range export continues rather than restarts it.
export function volumeAutomationFilter(track, fps) {
  if (!track.volumeKeyframes?.length) return `volume=${track.volume}`;
  const points = track.volumeKeyframes;
  const frame = `(t*${fps}+${track.localStartFrame})`;
  let expression = String(points.at(-1).value);
  for (let index = points.length - 2; index >= 0; index--) {
    const left = points[index], right = points[index + 1];
    const span = left.interpolation === 'hold' ? String(left.value) : `(${left.value}+(${right.value - left.value})*(${frame}-${left.frame})/${right.frame - left.frame})`;
    expression = `if(lt(${frame},${right.frame}),${span},${expression})`;
  }
  expression = `${track.volume}*if(lt(${frame},${points[0].frame}),${points[0].value},${expression})`;
  // aeval evaluates each output sample; volume:eval=frame would step by audio
  // decode packets and lose precision at fades and exact held-keyframe edges.
  // Some supported FFmpeg versions retain an unspecified two-channel layout
  // after aeval. Negotiate named stereo explicitly before amix/AAC encoding.
  return `aeval=exprs='val(0)*(${expression})|val(1)*(${expression})':channel_layout=stereo,aformat=channel_layouts=stereo`;
}

export function audioTrackFilters(track, fps) {
  const gain = track.volumeKeyframes
    ? `aresample=48000,aformat=channel_layouts=stereo,asetpts=N/SR/TB,${volumeAutomationFilter(track, fps)}`
    : `volume=${track.volume},aresample=48000,aformat=channel_layouts=stereo`;
  const sourceClock = /\.(mp4|webm)$/i.test(track.file) ? 'asetpts=PTS-STARTPTS,' : '';
  return `${sourceClock}atrim=start=${track.sourceStart}:duration=${track.sourceDuration},asetpts=PTS-STARTPTS,atempo=${track.speed},${gain},apad,atrim=duration=${track.duration},adelay=${track.delaySamples}S:all=1`;
}

export function soundtrackInputOptions(file) {
  const extension = file.split('.').at(-1).toLowerCase();
  if (!['wav', 'mp3', 'flac', 'ogg', 'mp4', 'webm'].includes(extension)) throw new Error('Unsupported private soundtrack container.');
  return ['-protocol_whitelist', 'file,pipe', '-f', extension === 'mp4' ? 'mov' : extension === 'webm' ? 'matroska' : extension,
    ...(extension === 'mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : [])];
}

export function validateSoundtrackProbe(probe, track) {
  const streams = Array.isArray(probe?.streams) ? probe.streams.filter((stream) => stream.codec_type === 'audio') : [];
  const selected = streams[track.audioStream ?? 0];
  const streamSeconds = Number(selected?.duration);
  const seconds = Number.isFinite(streamSeconds) && streamSeconds > 0 ? streamSeconds : Number(probe?.format?.duration);
  if (!selected || streams.length > 8 || !Number.isFinite(Number(selected.sample_rate)) || Number(selected.sample_rate) < 1 || Number(selected.sample_rate) > 192000 || !Number.isInteger(Number(selected.channels)) || Number(selected.channels) < 1 || Number(selected.channels) > 8 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 120 || track.sourceStart + track.sourceDuration > seconds + .01) throw new Error('The selected private audio stream exceeds its decode or source timing limits.');
  return selected;
}

// Container-only media work. File names, decoders and process arguments are
// owned by the runtime, never interpreted as commands or provider URLs.
export async function prepareAudioTracks(request, capsule) {
  for (const track of request.audioTracks) if (!capsule[track.file]?.length) throw new Error('A private soundtrack file is missing.');
  const plan = audioPlan(request);
  for (let index = 0; index < plan.length; index++) {
    const track = plan[index];
    const extension = track.file.split('.').at(-1).toLowerCase();
    const filename = `/tmp/soundtrack-${index}.${extension}`;
    await writeFile(filename, capsule[track.file], { flag: 'wx' });
    const inputOptions = soundtrackInputOptions(track.file);
    const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', ...inputOptions, '-show_entries', 'stream=codec_type,sample_rate,channels,duration:format=duration', '-of', 'json', filename], { timeout: 8000, maxBuffer: 16384 })).stdout);
    validateSoundtrackProbe(probe, track);
    Object.assign(track, { filename, inputOptions });
  }
  return plan;
}

export async function mixAudioTracks(request, capsule, inputVideo, outputVideo, preparedTracks) {
  // preparedTracks is a trusted in-process result of prepareAudioTracks, never
  // accepted from the request or capsule. It avoids re-reading media after frames.
  const plan = preparedTracks ?? await prepareAudioTracks(request, capsule);
  const audioOnly = request.mode === 'audio';
  if (!plan.length && !audioOnly) return 0;
  const args = ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-threads', '1', ...(audioOnly ? [] : ['-i', inputVideo])];
  const filters = [];
  for (let index = 0; index < plan.length; index++) {
    const track = plan[index];
    args.push('-threads', '1', ...track.inputOptions, '-i', track.filename);
    filters.push(`[${index + (audioOnly ? 0 : 1)}:a:${track.audioStream ?? 0}]${audioTrackFilters(track, request.fps)}[a${index}]`);
  }
  const duration = outputContract(request).frames / request.fps;
  filters.push(plan.length
    ? `${plan.map((_, index) => `[a${index}]`).join('')}amix=inputs=${plan.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95:level=false:latency=true,apad,atrim=duration=${duration}[mix]`
    : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[mix]`);
  const encoding = request.format === 'webm' ? ['-c:a', 'libopus', '-b:a', '160k']
    : ['wav', 'mov'].includes(request.format) ? ['-c:a', 'pcm_s16le']
    : request.format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k']
    : ['-c:a', 'aac', '-b:a', '192k'];
  args.push('-filter_complex', filters.join(';'), ...(audioOnly ? ['-vn'] : ['-map', '0:v:0', '-c:v', 'copy']), '-map', '[mix]', ...encoding,
    '-ar', '48000', '-ac', '2', '-map_metadata', '-1', '-threads', '1', '-t', String(duration),
    ...(['mp4', 'm4a', 'mov'].includes(request.format) ? ['-movflags', '+faststart'] : request.format === 'webm' ? ['-fflags', '+bitexact'] : []), '-fs', String(MAX_ARTIFACT_BYTES), outputVideo);
  await execute('ffmpeg', args, { timeout: 20_000, maxBuffer: 16384 });
  if ((await stat(outputVideo)).size >= MAX_ARTIFACT_BYTES) throw new Error('Soundtrack output exceeds the artifact limit.');
  return plan.length;
}
