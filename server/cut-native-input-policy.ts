/** Self-contained formats for existing native media uploads and trusted raster
 * generation. Never add manifest demuxers (HLS/DASH/concat/SDP/IMF) here: those
 * can open other local files even when network protocols are disabled.
 * This narrows demuxing; it is not an OS filesystem or decoder sandbox. */
export const CUT_NATIVE_INPUT_FORMATS = [
  "mov", "matroska", "webm", "avi",
  "wav", "mp3", "aac", "ogg", "flac",
  "png_pipe", "jpeg_pipe", "webp_pipe", "gif", "apng",
  "image2", "image2pipe", "lavfi",
].join(",");

export function cutNativeInputPolicyArgs() {
  return ["-protocol_whitelist", "file,pipe", "-format_whitelist", CUT_NATIVE_INPUT_FORMATS];
}
