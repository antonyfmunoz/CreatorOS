# Private soundtracks for code-rendered video

The isolated runtime accepts up to eight private WAV/MP3/FLAC/Ogg soundtrack
files in the source capsule. Each track explicitly defines composition start,
exclusive end, source trim, constant gain and playback speed. Source paths,
decoders, process arguments, duration/channel/sample-rate bounds, full request
hashes and output-byte ceilings remain controlled by the runtime.

Audio is mixed after frame rendering into stereo AAC without re-encoding the
video. Range exports preserve absolute track timing, with offsets resolved to
48 kHz samples. Overlap sums without automatic gain normalization; a peak limiter
protects clipping. Missing, malformed or out-of-range sources fail the render.

Fourteen unit tests passed. Actual local qualification decoded two mixed tones
from a private MP4 and measured silence before/after their timeline interval,
solo versus overlapping energy, and retained timing in a ranged export. Existing
code/image/video/motion/isolation/timeout/cancellation gates also passed. The
combined source still requires protected Linux and full application verification.

This does not enable public code execution. Per-frame React audio envelopes,
automatic audio extraction from FrameVideo, broad codec/VFR compatibility and
production integration remain distinct work; no full competitor parity claim.
