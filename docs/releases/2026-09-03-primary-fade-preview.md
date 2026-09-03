# Primary fade-to-black preview

Candidate, not yet qualified or deployed. Primary live preview previously refused
every transition other than a hard cut, even though native export supports fade
to black. One shared calculation now supplies native single-source/multitrack
export and the browser's primary opacity/source-gain envelope. Existing native
durations, first/last-edge rules and explicit fade overrides are preserved.
Segment indices include gaps, matching the native primary timeline.

Other transition types remain explicitly unsupported in live primary preview.
This does not implement final composited preview, layered video, titles, color
effects or other audio tracks. No new layout or provider configuration is added.

Unit tests cover native edge rules, short clips, speed, explicit fades and gaps.
Four mobile/desktop cases compare sampled live-preview pixels with actual native
MP4 frames for contiguous and gapped cuts, inspect exported fading audio, and
exercise live play/pause. Existing primary gap and audible mix tests remain.
The render wait stays at 60 seconds. Live audio gain uses the shared contract;
these new cases do not claim a sample-exact browser audio recording comparison.

The native calculation is a behavior-preserving extraction: earlier native images
already implement this fade contract. Unlike the new audio/format candidates,
the preview does not require a new codec or new render request field.
