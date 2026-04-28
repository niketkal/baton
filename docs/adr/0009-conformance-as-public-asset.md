# ADR 0009: Conformance suite as a public ecosystem asset

- Status: Accepted
- Date: 2026-04-26

## Context

The packet schema is a public contract. For Baton to function as a
shared format across multiple tools, third parties have to be able to
verify that a given implementation reads and writes the format
correctly. That requires:

- a shared, public test suite anyone can run
- cases that don't depend on private corpora or proprietary fixtures
- a runner that can target any implementation that exposes the standard
  CLI surface
- a result format other tools can reference when claiming
  Baton-compatibility

If conformance is private, "compatible" means whatever each vendor says
it means. If conformance is public, "compatible" means "passes the
shared cases" — a verifiable claim.

Two structural choices:

- **Private corpus only.** Higher quality cases (real transcripts), but
  cannot be published; third parties cannot run it; "compatible" is a
  marketing claim. Rejected.
- **Public synthetic cases plus private regression corpus.** The public
  suite is the contract; the private corpus is a development tool that
  stays internal. Ships in the OSS repo as `@baton/conformance`.

## Decision

Ship `@baton/conformance` as a **public package** in the main repo.

- `cases/` contains JSON files describing test cases: input artifacts,
  expected packet shape, expected lint result.
- All cases use **synthetic / anonymized fixtures** designed for third-
  party use. No real customer or partner transcripts.
- `runner.ts` runs cases against any implementation exposing the
  standard CLI surface.
- `report.ts` produces a public report (passing/failing case names) —
  the artifact behind any "Baton-compatible" claim.
- Third parties consume it as `npx @baton/conformance --against
  ./my-bin` or by adding it as a dev dependency.

Larger regression corpora used during development stay private. The
public suite is the contract.

The conformance suite ships in v1.0.0 with reference cases covering the
canonical paths: packet generation from sample transcripts, schema
validation on known-good and known-bad packets, file and git verification
behavior, stale-context behavior across commit changes, rendering for
each target, and adapter behavior for file and stdout paths.

## Consequences

Positive:

- Other tools can claim compatibility against shared tests rather than
  marketing copy alone.
- Schema changes naturally come with conformance updates in the same PR.
- The case format is a stable public artifact; community PRs can add
  edge cases.
- Anyone can run the suite without access to private data.

Negative:

- Synthetic cases trade some realism for shareability. Mitigated by
  having an internal regression corpus in addition to (not instead of)
  the public cases.
- Maintaining public cases is real work; out-of-date cases become
  evidence against rather than for compatibility. Mitigated by running
  conformance on every PR.
- Vendors who do not run the suite can still claim compatibility; the
  public report makes that claim falsifiable.

## Related

- `docs/guides/adding-a-conformance-case.md`
- ADR 0010 (CC0 schema license — third parties can implement without
  legal friction)
