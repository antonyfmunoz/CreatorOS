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

## Local qualification

The tests exercise three square layers of an owned wide RGBA image:
center crop, transparent fit and stretch. Actual browser save responses must
preserve the selected mode. Preview and decoded native output sample opaque,
transparent and partially transparent colors plus top/bottom padding.

- All **610 tests** passed, together with type checking, build, bundle budgets
  and the Worker dry-run. Log: `B:/CreativesOS-task-artifacts/cut-image-framing-verify.log`.
- Both mobile and desktop Chromium journeys passed in 2.0 minutes, without
  retries. Actual save responses retained the selected framing; real private
  native exports met the fixed color/padding sample assertions.
- Successful preview/export PNGs were retained and the desktop pair visually
  inspected in `test-results/creativesos-browser-qualification-d2f71c69dccb49f194ff7bff1d3da3a8`.
  Log: `B:/CreativesOS-task-artifacts/cut-image-framing-browser.log`.

Protected merge and production deployment must be recorded separately. No
deployed image-framing fix, all-pixel identity, general transformed-layer parity
or Remotion replacement claim is made here.

EXIF support is implemented but not yet field-qualified across real camera files.
Arbitrary color profiles, very large media, animated images and browser/codec
coverage remain separate.
