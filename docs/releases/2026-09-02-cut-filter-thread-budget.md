# Native filter scheduling candidate

Two legal concurrent jobs are not permission for each independent complex graph
to allocate a pool equal to all CPUs visible on the host. Raster decoder caps
alone do not bound filter scheduling. This candidate sets the native multitrack
graph pool to two threads by default (one on a single-CPU host). Operators may
explicitly tune `CUT_FILTER_THREADS` to 1–32; malformed values fail rather than
silently reverting to automatic scheduling.

Only the global complex-filter option changes. Source decoding, output codec,
preset, bitrate/CRF, frame rate, resolution, job concurrency and all qualification
deadlines/quality tolerances remain unchanged. This is not a process-wide CPU or
memory sandbox and does not bound decoder/encoder threads. A smaller graph pool
is not presumed faster: exact raw-frame comparison, actual workload repeats and
resource observations must establish its effects. Qualification is pending.

Reference: [FFmpeg complex-filter threads](https://ffmpeg.org/ffmpeg.html).
