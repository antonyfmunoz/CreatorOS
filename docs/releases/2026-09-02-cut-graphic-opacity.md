# Native graphic alpha work and transparent fit gutters

Graphic opacity now skips general per-pixel RGB expressions: opaque graphics
retain their alpha, constant envelopes use a 256-value alpha lookup table, and
varying envelopes evaluate only the extracted alpha plane before recombination.
Constant multiplication preserves the former truncation; an initial
colorchannelmixer experiment rounded some alpha values differently and was
replaced. Thread policy, worker capacity and browser deadlines are unchanged.

The owned two-second 720p / 60-frame synthetic workload contains three animated,
scaled, padded and rotated translucent overlays with opaque, constant and varying
envelopes. Retained receipt:
`B:/CreativesOS-task-artifacts/cut-native-opacity-study-Lvn6sx/receipt.json`.
Baseline trials took 10,870 and 10,584 ms; revised trials took 5,313 and 4,935 ms.
All four outputs decoded to exactly the same 60 frame hashes. This narrow local
result is not a GCP, load/concurrency or Remotion performance claim.

A separate exhaustive 8-bit-alpha gradient check retained identical raw RGBA
bytes for opaque, transparent, constant and varying expressions. A permanent
native qualification test covers seven envelopes, independent expected color
and alpha checks, and exact comparison against the former native expression.
Its browser-qualification execution remains pending along with full CI and
deployment; it does not infer fidelity from render completion alone.

SVG and projected primitive fitting now explicitly uses a transparent background
in Sharp's contain resize. The previous default could create opaque black gutters
over other layers. The new owned browser/native fixture checks four gutter and
two foreground positions. Execution is pending. This is not real GPU 3D parity.

Filter semantics: https://ffmpeg.org/ffmpeg-filters.html#lut_002c-lutrgb_002c-lutyuv
and https://ffmpeg.org/ffmpeg-filters.html#alphaextract .
