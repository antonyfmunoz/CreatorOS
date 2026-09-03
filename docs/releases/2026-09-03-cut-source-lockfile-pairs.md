# CutStudio source and dependency-lockfile handoff

## Implemented scope

- One action saves a new private source ZIP and a matching npm v3 lockfile,
  selects the two returned asset IDs, and permits composition registration only
  after both uploads/attachments are confirmed. Existing packages are untouched.
- The closed generator copies exact React 18.3.1, React DOM 18.3.1, Three 0.185.1
  and necessary transitive metadata from the qualified runtime lock. It does not
  resolve packages, contact a registry, install anything or execute source in
  the application. Unit tests compare all records to the runtime lock.
- Unsupported version ranges, dependency classes, overrides/workspaces and
  installation hooks do not receive a made-up lockfile. Existing embedded locks
  are not replaced silently. Ordinary source-only save/manual import remains.
- A changed source clears the old lockfile selection. Unsaved source blocks
  registration of the previously saved package. Selection is disabled while a
  save is pending. A partial pair failure retains the draft and reports the
  previously saved ZIP; retry creates new immutable assets, not an overwrite.
- Server registration checks npm v2/v3 root dependency declarations against the
  source manifest. For the qualified closed dependency set it also checks the
  complete graph, exact versions, registry URLs, integrity hashes and dependency
  edges. This applies independently of the browser, including direct API calls.
- Manifest-only ZIP inspection preserves ordinary binary source imports and
  existing archive limits. The smaller text-editor limits remain unchanged.

## Boundaries

The two object uploads are **not one storage transaction**. A failed second step
can leave the first private ZIP in Project media; the UI says so and does not
claim a saved pair. Storage cleanup/idempotent retry remain separate follow-up.

Legacy npm v1, Yarn and pnpm imports still receive their existing format checks,
not complete graph attestation. Non-pinned npm graphs receive declaration
reconciliation, not arbitrary dependency resolution. Neither is executable
qualification. Public isolated execution still reports `not_implemented`.

## Qualification checkpoint

- 42 focused source/archive/lockfile checks and application type checks passed.
- One initial new binary fixture exceeded the existing ZIP expansion-ratio
  ceiling. The fixture now uses stored binary bytes to test manifest inspection;
  the expansion-ratio ceiling was not relaxed.
- A separate actual-installer test covers starter, full React/Three, Three-only
  and empty graphs in newly allocated synthetic directories. It uses the
  installed npm CLI with lifecycle scripts disabled, empty credential config,
  fixed public registry, and checks unchanged manifests/locks plus actual package
  versions. This check is added to protected Verify and production qualification.
  All four actual-installer cases passed locally; the receipt is retained under
  `creativesos-cut-lockfiles-ROIknz`. Full browser tests, protected checks and
  deployment are pending at this checkpoint.

The source editor base in PR 166 merged at
`4af98a7b316f77e8b5488dbf9e363439529b6a9d` after all protected checks passed.
The last local exact-source run at `14033e7` passed 704 root tests, types/build
and worker checks but failed the existing 120-second browser-server startup
limit. Its evidence remains in qualification directory
`creativesos-browser-qualification-9accf572ae124cd98fe746abcd945604`.
No browser journey ran in that local attempt. Do not call it a browser pass.

## Primary format references

- [npm frozen installation behavior](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [npm lockfile structure](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)

These source/registration improvements are not Remotion parity or a public
executable player. Service isolation, dispatch/quota reconciliation, full code
preview/export, wider media/3D/scale and authorized competitor benchmarks remain.
