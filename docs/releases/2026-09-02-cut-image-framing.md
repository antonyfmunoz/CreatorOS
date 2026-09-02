# Authored image framing

Composition images now carry an explicit crop/fit/stretch choice through the
authoring control, preview and native export. The existing composition preview
default remains cover (crop); old manual EDL images retain the contain fallback.
Native image decoding respects EXIF orientation and uses transparent letterboxing
instead of painting a black box behind a contained image.

The new EDL field is optional rather than default-injected. Immutable queued
snapshots must not acquire a new field during schema parsing and fail their
previously valid content hashes. Regression coverage resolves a historical-shape
snapshot and still rejects a changed image fit with the old hash.

## Qualification pending

The candidate tests exercise three square layers of an owned wide RGBA image:
center crop, transparent fit and stretch. Actual browser save responses must
preserve the selected mode. Preview and decoded native output sample opaque,
transparent and partially transparent colors plus top/bottom padding.

Passing source checks, browser tests, protected merge and production deployment
must be recorded separately. No deployed image-framing fix, all-pixel identity,
general transformed-layer parity or Remotion replacement claim is made here.

EXIF support is implemented but not yet field-qualified across real camera files.
Arbitrary color profiles, very large media, animated images and browser/codec
coverage remain separate.
