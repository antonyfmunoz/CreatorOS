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

This candidate needs protected qualification, deployment of the corresponding
worker and a corrected live artifact before the production defect is closed.
