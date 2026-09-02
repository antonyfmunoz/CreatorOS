# Private embedded soundtracks for code-generated video

Code-render requests can explicitly select audio from a private capsule MP4 or
WebM. This removes a separate extraction step without enabling network media or
changing the silent-by-default `FrameVideo` component. Existing soundtrack trim,
offset, speed, gain automation and partial-export timing remain available.

An optional zero-based audio-stream index supports selecting the intended voice
or language track. Selected streams must satisfy the existing sample rate,
channel, source-duration and request bounds. Missing streams reject the render.
The video decoder is not used to mix the audio stream.
Soundtracks are materialized and probed before bundling or starting the browser,
so invalid audio does not consume a complete visual render. The prepared private
files are reused during mixing. A missing-track test containing nonterminating
source must fail in the audio-probe phase before that source can execute.

MP4 is opened by a fixed MOV demuxer with external references and absolute paths
explicitly disabled. WebM uses the fixed Matroska demuxer. Source files remain
capsule-local and the container remains network-denied.
See [FFmpeg's MOV demuxer security options](https://ffmpeg.org/ffmpeg-formats.html#mov_002fmp4_002f3gp).

Qualification creates actual private MP4/AAC and WebM/Opus fixtures with two
different tone tracks. It checks the selected quieter second track by both RMS
and frequency, checks the requested start/end, and rejects a nonexistent stream
and a silent video. Admission/unit checks are separate from actual container
qualification and from production readiness. This does not enable public code
execution or establish broad codec/Remotion parity.
