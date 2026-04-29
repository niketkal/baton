# Conformance benchmark — human-graded scenarios

This directory is a SCAFFOLD for the 10-scenario, human-graded
benchmark described in the Baton tech spec §10.3. Real scenarios are
populated post-launch from the curated golden corpus once enough
synthetic-but-realistic transcripts exist to grade against.

## What lives here, eventually

Each subdirectory under `scenarios/` will be a single benchmark
scenario:

```
scenarios/
  01-flaky-test/
    case.json           # input artifacts and expected outcome shape
    rubric.md           # human-readable grading rubric
    artifacts/          # synthetic transcripts/logs/diffs
```

Each scenario is graded on a fixed rubric covering:

1. **Faithfulness** — does the packet accurately summarise what the
   transcript said happened?
2. **Completeness** — are required fields populated with substantive
   content (not placeholders)?
3. **Actionability** — can the next tool act on `next_action`
   without re-reading the transcript?
4. **Hygiene** — no secrets surfaced into narrative fields, no
   competitor names, no untruthful provenance.

A run is "passing" when at least 8 of the 10 scenarios pass the
rubric.

## Why this is empty in v1

Tech spec §10.3 explicitly defers the populated benchmark to
post-launch. Shipping the scaffold now lets us add scenarios incrementally
without a separate package release. The runner code in
`packages/conformance/src/runner.ts` already drives the simpler
machine-graded conformance cases under `packages/conformance/cases/`;
this benchmark layer sits on top of it.

## What NOT to put here

- Real partner transcripts. Synthetic only. (CLAUDE.md invariant 5,
  tech spec §10.2.)
- Real secrets, even in test fixtures. Use clearly-marked fake
  tokens like `sk-test-...`.
- Competitor names in scenario titles or rubrics.
