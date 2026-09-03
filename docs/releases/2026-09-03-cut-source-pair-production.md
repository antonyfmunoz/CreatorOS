# Private source authoring, lockfile and history production receipts

## Exact released source

- Source authoring PR 166 release: `4af98a7b316f77e8b5488dbf9e363439529b6a9d`.
  Protected Verify `33703887438` and deployment `33707159720` passed 704 root
  tests and 366 browser journeys, 24 existing skips, no retries; public smoke 2/2.
- Source/lockfile/history PR 167 release: `559fd2ad58b5c63469f30b0733253480198b3874`.
  Protected Verify `33708822052` and deployment `33710282089` passed 729 root
  tests and 374 browser journeys, 24 existing skips, no retries; public smoke 2/2.
- The latter public release identity is `20260903T033518Z-0c4fd05a9b98`, fingerprint
  `0c4fd05a9b985e261ca0702c7cebea7258843a96f3ff803980dec256609e0714`, clean source,
  verified identity and matching 120-entry migration ledgers.

## Actual private production field evidence

Only the previously approved existing owner and private synthetic project were
used. No new account, public publication, user-code execution, charged generation
or timeline mutation occurred.

`B:/CreativesOS-task-artifacts/source-authoring-production-20260903030749059/receipt.json`
records successful authoring, section navigation, private ZIP save/reopen, second
immutable revision, unchanged original bytes/timeline and anonymous denial on the
first source-only release. The actual desktop screenshot was inspected.

`B:/CreativesOS-task-artifacts/source-authoring-production-20260903034852312/receipt.json`
records the later exact release's successful Undo/Redo, section navigation,
two actual private source/lockfile pairs, registration of the first immutable
pair, reload/reopen and a subsequent save that leaves the registered pair intact.
Both stored lockfiles were downloaded through their actual owned media-file
routes and matched the deterministic generator byte-for-byte: 1,312 bytes,
SHA256 `b17d7812cea087ae90e762708b3407bc0364090fd41cb018d4e84ac4a5910cd2`.
Anonymous requests were denied with 401. Timeline revision remained 3 and its
EDL remained identical. Public executable source remained `not_implemented`.

### Retained cleanup-check failure and read-only reconciliation

The latter receipt deliberately remains `passed: false`: its final cleanup
assertion omitted Clerk's documented `removed` inactive-session state. A separate
read-only audit (`cleanup-audit.json` in the same directory) inspected the entire
bounded creation window and found exactly one session, with status `removed`;
there were no active sessions in that window and no sessions were mutated by the
audit. The functional checks passed; the original harness failure is not erased
or relabeled. The helper now accepts the actual inactive state. No existing user
session was targeted for revocation.

## Remaining separation

The expanded source workspace, native preparation diagnostics and owned-browser
shutdown changes have independent candidates and qualification. They are not
included in the released source above. Native renderer image promotion and real
output testing remain separate from the app deployment. Public code execution,
isolated compute approval, wider compatibility/scale and authorized same-input
Remotion benchmarks remain open. These source-custody receipts are not a parity
verdict or proof of a functioning public TSX renderer.
