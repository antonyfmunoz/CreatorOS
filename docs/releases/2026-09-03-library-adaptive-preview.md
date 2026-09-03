# Media library: authorized video preview and response ownership

Candidate; not yet tested or deployed.

The library previously rendered a plain video element with the original access
URL. It therefore did not use the shared adaptive rendition selection, captions
or playback telemetry even when those renditions existed. This candidate uses
the existing authorized MediaPlayer without publishing any feed post. Private
assets retain authorized progressive delivery; public assets can use HLS.

Opening two assets in quick succession also let the older access response replace
the current preview. A request generation now owns preview completion, errors and
its loading indicator. Unmount and deletion invalidate outstanding access results.

New browser checks use real uploaded bytes, actual server-created playback
sessions and the real packaging worker in an isolated database. They cover public
HLS and private progressive playback using native keyboard controls, plus a held
real access response released after a second asset is selected. No fixture replaces
the asset list, media bytes or playback response. These checks have not yet run.

No provider setup, permission expansion, public production fixture or parity claim
is included. Public live-HLS fixture authorization remains a separate gate.

The first protected desktop run at `fd593aa` rejected all three new fixtures:
the test submitted an unsupported generic `file` multipart field. It now uses
the real `video` and `image` field contract. Server upload validation is unchanged;
the failed receipt is retained in `completed-job-100624182064.log`. Final playback
also asserts that HLS never fell back and that no error telemetry was emitted.
