# Benchmark evidence custody

## Outcome

Benchmark Lab now owns the complete evidence-ingest path required to run the
twenty specialist-substitution comparisons without manually moving artifact
identifiers and hashes between a packaging script and the application.

## Product behavior

- An operator uploads exactly one input manifest, action log, output artifact,
  and run recording from the visible run-completion form.
- Every file is stored as a tenant-scoped private Media Cloud asset. Direct R2
  upload remains the production path; the bounded proxy path keeps local and
  CORS-recovery operation functional.
- The server reads the stored bytes, calculates SHA-256, and returns a canonical
  `asset://<uuid>` reference. The form fills both fields automatically while
  preserving an explicit manual path for approved external evidence.
- Sealing accepts exactly four unique evidence kinds with complete SHA-256
  checksums. Stored assets must be ready, private, download-class evidence in
  the run's workspace.
- The server re-reads and re-hashes every custodied asset at seal time. Invalid
  asset URIs, duplicate asset reuse, tenant crossing, overwritten bytes, and
  checksum tampering fail closed.
- Accepted bytes are copied to a new private object key that has never been
  exposed through a browser PUT signature before the ledger closes. Any still-
  valid upload URL points only at the superseded object, which is removed after
  the asset record moves to sealed custody.

## Qualification boundary

The mobile and desktop browser journey uploads all four artifact types through
the rendered UI, observes canonical references and 64-character hashes,
confirms cross-tenant attachment is hidden, proves a changed checksum is
rejected, and then completes the valid run and remediation lifecycle. This
qualifies native evidence custody; it does not claim that any competitor
comparison has been performed by an authorized human operator.
