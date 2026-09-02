# Portrait and anamorphic delivery correction

The fresh production job `6053a919-de90-4654-8494-f65ae254edc6` completed on GCP
execution `creativesos-cut-worker-swq6x`, one task, with immutable worker image
`sha256:72d0be8b879c0696f28252a9f6e7413c7f5d14753bd3353ad33d6bcc977e6df4`
and source label `1be110e0d6989f4583b2cadcd83eda6fd6768796`.

Independent private storage retrieval verified object
`75d8eefb-0e6c-423c-b35e-8d2fc1232926`, 284617 bytes, SHA-256
`cce8eaee94e8df0e282aeef9c09a015afa64498f801d6ef25bba749168733c0d`.
It decoded as H.264 406x720, 30 fps, 90 frames, three seconds plus AAC audio.
However, its inherited sample aspect ratio was `608:609`; the browser reported
406x721 display dimensions. Successful rendering therefore did not close the
output-geometry gate.

The candidate explicitly fits each source's displayed aspect ratio into the
requested canvas, normalizes pixel aspect to 1:1, and pads the canvas. Both
multitrack and ordinary fixed-canvas paths share this function. Source-aspect
exports preserve displayed geometry, bound width to 3840, and also normalize
sample aspect. Requested portrait rendition dimensions have not been redefined.

Native encoded-media tests cover ordinary and 4:3 / 8:9 anamorphic input sample
aspects, exact portrait dimensions and displayed source geometry. The existing
mobile/desktop private-frame/preview journey additionally renders a portrait
video and checks the browser's actual decoded dimensions. Existing exact-frame,
format, revoked-access and preview retry checks remain; no deadline was relaxed.

## Corrected production geometry evidence

PR #124 passed protected Verify `33589977074`, CodeQL `33589977080` and
isolated-runtime qualification `33589977070`, then merged as
`d9e2947736da6c398572de6677f064141cc3ee41`. GCP build
`a118fa29-d765-4b3f-b6c3-a9a5b75bdbc2` produced immutable image
`sha256:45d406bebd3d32b5f0b3523f41eb58d521edb56705a339d39070a2b331de4ef6`.
The existing worker was updated only to that image and source label; resource,
task-count, secret and IAM configuration was preserved.

Fresh private job `55ddd4f7-c089-451e-9391-692dd70269cb` completed on execution
`creativesos-cut-worker-x5d5q` (one successful task, 2026-09-02 04:48:49 through
04:51:27 UTC). Independent private-object retrieval verified asset
`99bf765d-a426-455e-a259-8f74d56afe85`, 284608 bytes, SHA-256
`68dfc51d00ccb206247b19e755f2107e9a5710899d21af52afaff7a161e03fc7`.
FFprobe now reports H.264 406x720, SAR 1:1, DAR 203:360, 30 fps, 90 frames,
three seconds and AAC. The actual signed-in browser video reports 406x720,
three seconds and readyState 4. The public web release was still `1be110e` at
this observation; this is worker/artifact proof, not a claim that the newer
website deployment had completed.

Geometry is corrected in this live artifact. Inspection of decoded frame 30
also exposed oversized/clipped text and an opaque background outside the title
box. Those are separate open visual-fidelity defects, tracked by the responsive
title correction. Neither SAR success nor successful decoding establishes
Remotion parity or complete composition-preview fidelity.
