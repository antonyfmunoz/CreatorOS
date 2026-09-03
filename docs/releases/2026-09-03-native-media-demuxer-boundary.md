# Native media input-container boundary

The existing `file,pipe` protocol restriction prevented external fetches but did
not make an uploaded file self-contained. Actual disposable-file controls proved
that both native inspection and rendering accepted a local HLS playlist and a
concat document disguised with an `.mp4` extension. The independent decoder
returned the referenced fixture's pixels. No real user's private files were used.

## Change

- Apply a fixed self-contained demuxer allowlist before native inspection and
  before **each** FFmpeg input. No tenant-configurable policy or override exists.
- Preserve the existing MP4/MOV, WebM, AVI, common audio and supported image
  containers, plus trusted generated raster sequences and synthetic sources.
  HLS/DASH/concat/SDP/IMF are not upload-input formats.
- Apply the same boundary in the shared ingest pipeline, before probe,
  thumbnail, waveform, transcode and adaptive-output jobs. Rejecting uploaded
  manifests must not remove the ability to generate an HLS delivery output.
- Reuse the bounded subprocess owner for ingest: strip application credentials,
  drain private diagnostics, cap aggregate metadata at two million bytes and
  release the child only after its actual exit. Retain existing processing
  deadlines, lease registration and public `media_timeout` / `media_process_failed`
  categories; never persist decoder stderr or private source paths as job errors.
- Run the existing real Media Cloud ingest qualification on a fresh isolated
  database for pull requests and deployments. Preserve its generated synthetic
  media; both the protected aggregate and production deploy now require this
  additional gate. Existing browser, decoder and lifecycle gates are unchanged.

## Evidence and limits

The initial fixture attempts are retained but are not vulnerability proof:
`cut-demuxer-red-20260903T011228.log` failed on invalid duration syntax, and
`...T011318.log` demonstrated that current FFmpeg already rejects an HLS document
under a non-HLS extension. The corrected controls retain a valid HLS filename
and separately disguise concat as MP4. Baseline `...T011421.log` failed all four
boundary assertions because the application successfully inspected and rendered
those referenced files. Independent controls succeeded first.

The first native-only correction passed 36 focused tests in
`cut-demuxer-focused-20260903T011542.log`, including four video, seven audio and
four image formats with actual decoded pixels/PCM, generated PNG sequences,
metadata, process cleanup, diagnostics and progress. Shared-ingest checks and
the complete exact-candidate release gates remain pending at this checkpoint.

The expanded run `cut-demuxer-focused-20260903T013110.log` passed 40/41. Its
0.3-second, three-frame generated HLS output failed independent playback because
the decoder identified its tiny TS segment as MPEG and rejected the extension.
That interop failure remains open; no permissive decoder flag was added. The
same packaging check with a 1.2-second output passed all five managed-process
tests on September 3 at 08:33 UTC, including real playback, timeout/cancellation
cleanup and aggregate-output overflow. This does not qualify tiny-clip HLS or
the complete release. All normal source-container controls remain unchanged.

This is not an OS filesystem sandbox, a full native-code vulnerability audit,
all-format support or public executable TSX. Decoder vulnerabilities, additional
media workloads, resource admission and the isolated code-service deployment
remain separate gates. No provider configuration, budget, topology, codec
quality, test deadline or pixel threshold changed.

Primary reference: [FFmpeg input demuxer allowlist and external-track options](https://ffmpeg.org/ffmpeg-formats.html).
