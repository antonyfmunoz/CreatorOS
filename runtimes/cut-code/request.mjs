export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
export function validateRequest(request) {
  if (!request || request.version !== 1 || !['still', 'video', 'sequence'].includes(request.mode)) throw new Error('Unsupported code-render request.');
  const { width, height, fps, durationInFrames } = request;
  for (const [name, value, min, max] of [['width', width, 16, 3840], ['height', height, 16, 3840], ['fps', fps, 1, 60], ['durationInFrames', durationInFrames, 1, 600]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  }
  if (width % 2 || height % 2 || width * height > 3840 * 2160) throw new Error('Invalid output dimensions.');
  const frame = request.frame ?? 0;
  if (!Number.isInteger(frame) || frame < 0 || frame >= durationInFrames) throw new Error('Frame is outside the composition.');
  const frameRange = request.frameRange ?? [0, durationInFrames - 1];
  if (!Array.isArray(frameRange) || frameRange.length !== 2 || frameRange.some((value) => !Number.isInteger(value) || value < 0 || value >= durationInFrames) || frameRange[1] < frameRange[0]) throw new Error('Invalid inclusive frame range.');
  if (request.mode === 'still' && request.frameRange !== undefined) throw new Error('A still uses frame, not frameRange.');
  if (request.mode !== 'still' && frame !== 0) throw new Error('A video or sequence uses frameRange, not frame.');
  if (request.mode !== 'still' && width * height * (frameRange[1] - frameRange[0] + 1) > 500_000_000) throw new Error('Render exceeds the pixel-frame budget.');
  const format = request.format ?? (request.mode === 'video' ? 'mp4' : 'png');
  if (!(request.mode === 'video' ? ['mp4'] : ['png', 'jpeg', 'webp']).includes(format)) throw new Error('Unsupported output format for this mode.');
  const quality = request.quality ?? (['jpeg', 'webp'].includes(format) ? 90 : null);
  if (['jpeg', 'webp'].includes(format) ? !Number.isInteger(quality) || quality < 1 || quality > 100 : quality !== null) throw new Error('Quality is supported only for JPEG/WebP and must be within 1..100.');
  if (typeof request.entrypoint !== 'string' || !/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(tsx|jsx|ts|js)$/.test(request.entrypoint)) throw new Error('Invalid source entrypoint.');
  if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input) || JSON.stringify(request.input).length > 64_000) throw new Error('Inputs must be an object smaller than 64 KB.');
  return { version: 1, mode: request.mode, width, height, fps, durationInFrames, frame, entrypoint: request.entrypoint, input: request.input, format, quality, ...(request.mode === 'still' ? {} : { frameRange }) };
}

export function outputContract(request) {
  const start = request.mode === 'still' ? request.frame : request.frameRange[0];
  const end = request.mode === 'still' ? start : request.frameRange[1];
  const mediaType = request.mode === 'sequence' ? 'application/zip' : { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4' }[request.format];
  return { start, end, frames: end - start + 1, mediaType, extension: request.mode === 'sequence' ? 'zip' : request.format };
}
