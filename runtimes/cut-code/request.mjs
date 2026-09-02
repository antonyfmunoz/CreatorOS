export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
export function validateRequest(request) {
  if (!request || request.version !== 1 || !['still', 'video', 'sequence'].includes(request.mode)) throw new Error('Unsupported code-render request.');
  const { width, height, fps, durationInFrames } = request;
  for (const [name, value, min, max] of [['width', width, 16, 3840], ['height', height, 16, 3840], ['fps', fps, 1, 60], ['durationInFrames', durationInFrames, 1, 216000]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  }
  if ((request.mode === 'video' && (width % 2 || height % 2)) || width * height > 3840 * 2160) throw new Error('Invalid output dimensions.');
  if (durationInFrames / fps > 3600) throw new Error('Composition timelines are limited to one hour.');
  const frame = request.frame ?? 0;
  if (!Number.isInteger(frame) || frame < 0 || frame >= durationInFrames) throw new Error('Frame is outside the composition.');
  const frameRange = request.frameRange ?? [0, durationInFrames - 1];
  if (!Array.isArray(frameRange) || frameRange.length !== 2 || frameRange.some((value) => !Number.isInteger(value) || value < 0 || value >= durationInFrames) || frameRange[1] < frameRange[0]) throw new Error('Invalid inclusive frame range.');
  if (request.mode === 'still' && request.frameRange !== undefined) throw new Error('A still uses frame, not frameRange.');
  if (request.mode !== 'still' && frame !== 0) throw new Error('A video or sequence uses frameRange, not frame.');
  if (request.mode !== 'still' && frameRange[1] - frameRange[0] + 1 > 600) throw new Error('Select a range of at most 600 frames per render.');
  if (request.mode !== 'still' && width * height * (frameRange[1] - frameRange[0] + 1) > 500_000_000) throw new Error('Render exceeds the pixel-frame budget.');
  const format = request.format ?? (request.mode === 'video' ? 'mp4' : 'png');
  if (!(request.mode === 'video' ? ['mp4', 'webm'] : ['png', 'jpeg', 'webp']).includes(format)) throw new Error('Unsupported output format for this mode.');
  const quality = request.quality ?? (['jpeg', 'webp'].includes(format) ? 90 : null);
  if (['jpeg', 'webp'].includes(format) ? !Number.isInteger(quality) || quality < 1 || quality > 100 : quality !== null) throw new Error('Quality is supported only for JPEG/WebP and must be within 1..100.');
  if (typeof request.entrypoint !== 'string' || !/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(tsx|jsx|ts|js)$/.test(request.entrypoint)) throw new Error('Invalid source entrypoint.');
  if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input) || JSON.stringify(request.input).length > 64_000) throw new Error('Inputs must be an object smaller than 64 KB.');
  const tracks = request.audioTracks ?? [];
  if (!Array.isArray(tracks) || tracks.length > 8 || (tracks.length && request.mode !== 'video')) throw new Error('Up to eight private soundtracks are supported on video exports only.');
  const audioTracks = tracks.map((track) => {
    if (!track || typeof track !== 'object' || typeof track.file !== 'string' || track.file.length > 200 || !/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(wav|mp3|flac|ogg|mp4|webm)$/i.test(track.file)) throw new Error('A soundtrack must identify a supported private capsule audio or video file.');
    if (track.audioStream !== undefined && (!Number.isInteger(track.audioStream) || track.audioStream < 0 || track.audioStream > 7)) throw new Error('Audio stream must be an index within 0..7.');
    const { startFrame = 0, endFrame = durationInFrames, sourceStartSeconds = 0, speed = 1, volume = 1 } = track;
    if (![startFrame, endFrame].every(Number.isInteger) || startFrame < 0 || endFrame <= startFrame || endFrame > durationInFrames || !Number.isFinite(sourceStartSeconds) || sourceStartSeconds < 0 || sourceStartSeconds >= 120 || !Number.isFinite(speed) || speed < .5 || speed > 2 || !Number.isFinite(volume) || volume < 0 || volume > 2) throw new Error('Invalid soundtrack timing or gain.');
    const points = track.volumeKeyframes;
    if (points !== undefined && (!Array.isArray(points) || points.length < 1 || points.length > 32)) throw new Error('Volume automation requires 1..32 keyframes per soundtrack.');
    const volumeKeyframes = points?.map((point, index) => {
      if (!point || typeof point !== 'object' || !Number.isInteger(point.frame) || point.frame < 0 || point.frame > endFrame - startFrame || (index > 0 && point.frame <= points[index - 1].frame) || !Number.isFinite(point.value) || point.value < 0 || point.value > 2 || !['linear', 'hold'].includes(point.interpolation ?? 'linear')) throw new Error('Volume keyframes must be ordered, bounded track-local frames and gains.');
      return { frame: point.frame, value: point.value, interpolation: point.interpolation ?? 'linear' };
    });
    return { file: track.file, startFrame, endFrame, sourceStartSeconds, speed, volume, ...(volumeKeyframes ? { volumeKeyframes } : {}), ...(track.audioStream !== undefined ? { audioStream: track.audioStream } : {}) };
  });
  return { version: 1, mode: request.mode, width, height, fps, durationInFrames, frame, entrypoint: request.entrypoint, input: request.input, format, quality, audioTracks, ...(request.mode === 'still' ? {} : { frameRange }) };
}

export function outputContract(request) {
  const start = request.mode === 'still' ? request.frame : request.frameRange[0];
  const end = request.mode === 'still' ? start : request.frameRange[1];
  const mediaType = request.mode === 'sequence' ? 'application/zip' : { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' }[request.format];
  return { start, end, frames: end - start + 1, mediaType, extension: request.mode === 'sequence' ? 'zip' : request.format };
}
