# Audio-source video target correctness

Candidate, not yet production-qualified. The single-source audio path previously
created an unconditional 1920x1080 black picture and skipped caption composition.
Requested resolution/aspect and captions could therefore disagree with the file.

Route the generated black picture through the same framing and caption filters
as video sources, generate it at the requested frame rate, and bound output to
the edited duration. Keep the selected codec/container and existing audio mix.
These remain video exports from audio sources, not standalone WAV/MP3 exports.

Eight new mobile/desktop cases cover MP4/WebM and vertical/square targets, actual
25/50-frame output, timed caption pixels, audible decoded PCM, private ownership
and normal video-preview playback. Existing video-source format tests remain.

No new provider service, credentials, capacity or IAM. This stacks on the audio
and format candidates; matching native worker-image qualification and production
artifact tests remain required before activation. Full Remotion parity, audio-only
output formats and general motion/text/3D quality benchmarks are not implied.
