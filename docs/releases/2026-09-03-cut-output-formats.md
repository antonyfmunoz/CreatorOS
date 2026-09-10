# Native MP4 and WebM export

Candidate, not deployed or fully qualified. The matching native worker image is
required; do not expose a working-production claim while an older image ignores
the requested format. The current GCP management login needs reauthentication.

The conventional render UI and request contract offer MP4 (H.264/AAC, unchanged
default) and WebM (VP9/Opus). Codec-specific profiles replace H.264-only arguments
in both native render paths. Output filename, MIME, muxer and private asset
metadata use the same validated selection. Input/output paths stay distinct.
The audio-bitrate control identifies AAC or Opus appropriately. These are opaque
video exports; alpha, HDR, ProRes, AV1 and other containers remain separate work.

New desktop/mobile tests render both formats through both paths, inspect actual
container/codecs and frame counts, decode a blue center pixel, check private
cross-owner denial, and play the result through the normal preview control.
Their results, full regression checks and exact production artifact proof are
pending. No new provider, execution service, capacity or paid topology is added.

Design references checked 2026-09-03: [Remotion encoding guide](https://www.remotion.dev/docs/encoding)
and [FFmpeg libvpx options](https://ffmpeg.org/ffmpeg-codecs.html#libvpx).
These are public behavioral references, not copied competitor implementation.
Codec choices trade processing time, quality and compatibility; this feature
alone does not establish perceptual or overall competitor parity.
