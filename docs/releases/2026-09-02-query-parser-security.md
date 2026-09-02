# Query parser security patch without an Express major upgrade

The root lockfile contained qs 6.15.3. Advisory GHSA-4mjr-xmp4-gh2g identifies a
denial-of-service condition involving constructor-shaped input and serializing
parsed data; 6.16.0 is the patched release. The narrowly scoped override updates
only qs to that version and retains Express 4 and its existing route semantics.
No claim is made that the application's exact routes were exploitable.

Dependabot PR 153 instead selected Express 5.2.1. Its two protected browser jobs
failed at server startup on the existing `/api/public/sites/:slug/go/*` pattern.
It was not merged, no route assertion was removed and no required gate bypassed.

This candidate uses a fresh, dedicated local dependency installation, not the
shared worktree node_modules. Tests cover the installed/locked patched versions,
constructor-shaped round trips and normal nested/Buffer serialization. Full
combined application/browser/protected qualification and deployment remain
separate. This patch does not declare every dependency or deployed image clean.

Source: [qs maintainer advisory](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g).
