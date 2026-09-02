const presets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];

export function normalizeVideoEncoding(value, mode, format) {
  if (value === undefined) return undefined;
  if (mode !== 'video' || !['mp4', 'webm'].includes(format) || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['crf', 'bitrateKbps', 'preset', 'cpuUsed'].includes(key))) throw new Error('Video encoding controls require an MP4 or WebM video export.');
  if (value.crf !== undefined && value.bitrateKbps !== undefined) throw new Error('Choose constant quality or a target bitrate, not both.');
  if (value.bitrateKbps !== undefined && (!Number.isInteger(value.bitrateKbps) || value.bitrateKbps < 64 || value.bitrateKbps > 100000)) throw new Error('Video bitrate must be an integer within 64..100000 Kbps.');
  const crf = value.bitrateKbps === undefined ? value.crf ?? (format === 'mp4' ? 23 : 30) : undefined;
  if (crf !== undefined && (!Number.isInteger(crf) || crf < (format === 'mp4' ? 1 : 0) || crf > (format === 'mp4' ? 51 : 63))) throw new Error('CRF is outside the selected codec range.');
  if (format === 'mp4' ? value.cpuUsed !== undefined || (value.preset !== undefined && !presets.includes(value.preset)) : value.preset !== undefined || (value.cpuUsed !== undefined && (!Number.isInteger(value.cpuUsed) || value.cpuUsed < 0 || value.cpuUsed > 8))) throw new Error('Encoder speed control does not match the selected codec.');
  return { ...(crf === undefined ? { bitrateKbps: value.bitrateKbps } : { crf }), ...(format === 'mp4' ? { preset: value.preset ?? 'fast' } : { cpuUsed: value.cpuUsed ?? 4 }) };
}

export function videoEncodingArgs(format, settings) {
  if (!['mp4', 'webm'].includes(format)) throw new Error('Unsupported configurable video codec.');
  const options = normalizeVideoEncoding(settings, 'video', format);
  const rate = options?.bitrateKbps !== undefined ? ['-b:v', `${options.bitrateKbps}k`] : format === 'webm' ? ['-b:v', '0', '-crf', String(options?.crf ?? 30)] : options ? ['-crf', String(options.crf)] : [];
  return format === 'webm'
    ? ['-c:v', 'libvpx-vp9', '-threads', '1', ...rate, '-deadline', 'good', '-cpu-used', String(options?.cpuUsed ?? 4), '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-metadata:s:v:0', 'alpha_mode=1', '-fflags', '+bitexact']
    : ['-c:v', 'libx264', '-threads', '1', '-preset', options?.preset ?? 'fast', ...rate, '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
}
