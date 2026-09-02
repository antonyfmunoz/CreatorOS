# Code capsule byte-integrity gate

The source-package validator previously checked ZIP directory metadata but did
not inflate entries or verify their CRC32. It now verifies actual stored/deflated
bytes before accepting a capsule. Decompression is bounded by the declared entry
size as well as the existing 25 MiB archive, 100 MiB total expanded-data, 100:1
ratio and 5,000-entry limits. Lying length fields cannot bypass actual inflation
limits. No source is extracted to the filesystem, imported, compiled or executed.

The gate also binds local headers to the central directory, validates signed and
unsigned 32-bit streaming descriptors, rejects overlapping payloads, trailing
compressed data, split archives, unsupported flags, special filesystem entries,
file/directory conflicts and ambiguous filename encodings. ZIP64 and alternate
Unicode-path extensions are explicitly unsupported; normal bounded archive
comments and supported stored/deflated entries remain accepted.

CRC32 detects damaged/inconsistent content; it is **not** authenticity,
authorization, a malware scan or an executable-code isolation boundary. Private
asset ownership and the missing public isolated executor remain separate gates.
Parsing remains bounded synchronous work, not a scalable asynchronous admission
service. No runtime or dependency installation policy is relaxed.

## Evidence

Eight focused unit tests pass, including real deflation, streamed descriptors,
tampered contents, forged inflation sizes, extra compressed bytes, overlapping
local records, invalid Unicode and archive comments. The combined candidate's
619 root tests, types, build, bundle budget and Worker dry-run passed. The initial
type check caught Buffer iteration incompatible with the application's target;
an indexed CRC loop fixed that without relaxing compiler settings. Both actual
programmable-cinema browser journeys passed within the 35/36 combined run; that
run remains failed because the first mobile image-framing page did not finish
loading within the unchanged assertion deadline. The journey now also
uploads a damaged private capsule, expects HTTP 400 with no composition persisted,
then explicitly selects and saves the valid capsule. Protected merge/deployment
and actual public executable-code workflows are not claimed.

References: [PKWARE ZIP format](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT),
[Node 22 bounded zlib options](https://nodejs.org/download/release/v22.17.0/docs/api/zlib.html#class-options).
