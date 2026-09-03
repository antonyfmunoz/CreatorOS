# Short HLS packaging: actual media, not extended fixtures

## Failure and scope

The earlier native-input qualification exposed a three-frame (0.3-second)
H.264 MPEG-TS segment that FFmpeg misdetected as MPEG-PS through its HLS reader.
Increasing the fixture duration demonstrated a longer working path but did not
fix this. The original failure remains in the qualification record.

The new experiment reproduces the short-segment failure independently. Repeating
program tables does not fix it. Standard null transport packets bring very small
segments to a 3,760-byte minimum without changing existing bytes, packet timing,
frame count or decoded pixels. Existing larger segments are unchanged. This is
output-only finalization in a worker-owned directory, not an exception to the
manifest/input/network restrictions. Native subprocess security remains intact.

The same experiment found zero target-duration headers on sub-second playlists.
Finalization now sets a positive target bounding the longest segment. Exact
EXTINF timing is preserved: no added pictures, silence or artificial duration.

## Evidence and remaining gates

- Local diagnostic: original three-frame automatic playback fails; finalized
  playback passes. One-/three-/twelve-frame pictures match their source exactly.
- The first single-frame diagnostic accidentally used FFmpeg's default output
  frame synchronization. Corrected independent decoding uses passthrough, so it
  measures actual pictures rather than automatically duplicating them.
- First focused test run: 13/15 passed. The unfinalized two-/three-frame timing
  control itself could not auto-detect the input. Only this known synthetic
  baseline now names its format explicitly. Final-output playback and inspection
  continue to require automatic detection without relaxed extensions or formats.
- Corrected focused run: 16/16 passed, including all-pixel/packet-timing equality,
  idempotent bounded padding, invalid-output rejection, positive target headers
  and retained uploaded-manifest denial.
- Actual isolated database/storage qualification passes one-/three-/twelve-frame
  jobs through the normal packaging and persisted rendition path. Independently
  retrieved and decoded masters retain every picture. The existing full ingest,
  rights, lineage, usage and attribution checks also remain passing.
- New browser cases require actual HLS playback to the end, with no progressive
  fallback or error telemetry. Exact-candidate root/browser/CI, deployment and
  public release field proof are pending at this checkpoint.

This narrow repair is not a claim of all-browser, long-content, live-streaming,
decoder-matrix or Remotion parity. Previous native render latency failures and
the unapproved public executable-code service remain open.

## Primary references

- [FFmpeg HLS and transport format options](https://ffmpeg.org/ffmpeg-formats.html)
- [FFmpeg transport probe implementation](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mpegts.c)
- [FFmpeg null transport packet implementation](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mpegtsenc.c)
- [HLS target duration](https://www.rfc-editor.org/rfc/rfc8216#section-4.3.3.1)

Protocol facts informed the original finalizer; no FFmpeg implementation was
copied into the application.
