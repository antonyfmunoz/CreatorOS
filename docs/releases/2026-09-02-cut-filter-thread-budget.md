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
resource observations must establish its effects.

The standalone raw comparison passed: eight raster inputs with animated color,
rotation and opacity produced byte-identical RGBA hashes for all 30 frames with
automatic and 1/2/4 filter threads. Receipt:
`native-filter-budget-20260902195421252/cut-studio-filter-budget-b-5476e-r-alpha-and-geometry-frames/filter-budget/receipt.json`.
The owned desktop cinema workflow passed in 3.1 minutes on source `0e708ec`,
within unchanged individual and whole-workflow deadlines. The corrected process
sampler observed at most 86 threads in one native process and 170 combined;
it rejects recycled parent PID attribution and retains the process handle.
Evidence: `creativesos-browser-qualification-6bb90ac8d00b4ee7b9f6ef49697f1bf6`,
`cut-cinema-study-20260902T125606.log` and its resources JSONL. This single run
does not establish a speedup: its batch jobs still took roughly 75 seconds.
Combined source `fa7d1ff` also passed full root and SQL admission qualification.
Repeated combined browser and exact protected checks remain open.

Reference: [FFmpeg complex-filter threads](https://ffmpeg.org/ffmpeg.html).
