export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
export function validateRequest(request) {
  if (!request || request.version !== 1 || !['still', 'video'].includes(request.mode)) throw new Error('Unsupported code-render request.');
  const { width, height, fps, durationInFrames } = request;
  for (const [name, value, min, max] of [['width', width, 16, 3840], ['height', height, 16, 3840], ['fps', fps, 1, 60], ['durationInFrames', durationInFrames, 1, 600]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  }
  if (width % 2 || height % 2 || width * height > 3840 * 2160) throw new Error('Invalid output dimensions.');
  if (request.mode === 'video' && width * height * durationInFrames > 500_000_000) throw new Error('Render exceeds the pixel-frame budget.');
  const frame = request.frame ?? 0;
  if (!Number.isInteger(frame) || frame < 0 || frame >= durationInFrames) throw new Error('Frame is outside the composition.');
  if (typeof request.entrypoint !== 'string' || !/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(tsx|jsx|ts|js)$/.test(request.entrypoint)) throw new Error('Invalid source entrypoint.');
  if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input) || JSON.stringify(request.input).length > 64_000) throw new Error('Inputs must be an object smaller than 64 KB.');
  return { version: 1, mode: request.mode, width, height, fps, durationInFrames, frame, entrypoint: request.entrypoint, input: request.input };
}
