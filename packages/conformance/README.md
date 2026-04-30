# @batonai/conformance

Public conformance suite for Baton-compatible CLIs. Synthetic
fixtures only — no real partner transcripts (see CLAUDE.md
invariant 5 / tech spec §10.2).

## Running against a local CLI build

```sh
pnpm --filter @batonai/conformance build
node packages/conformance/dist/bin/baton-conformance.js \
  --against packages/cli/dist/bin.js
```

Or via the workspace command:

```sh
baton conformance
```

## Running against a third-party packaging

```sh
npx @batonai/conformance --against /path/to/their-baton-cli.js
```

## What the runner does

For each case in `cases/`, the runner:

1. Creates a clean temp dir.
2. Spawns `<bin> ingest <kind> <path>` for each artifact.
3. Spawns `<bin> compile --packet <id> --mode fast --json`.
4. Reads the produced `packet.json` and compares against
   `expected.packetShape` (partial match — only declared keys are
   checked).
5. Spawns `<bin> lint --packet <id> --strict --json` and checks both
   the exit code and any expected finding codes.

Results aggregate into a `ConformanceReport` printable in human or
JSON mode.

## Adding a case

1. `mkdir packages/conformance/cases/<id>` plus `artifacts/`.
2. Write hand-crafted synthetic artifact files (no real partner
   content, no real secrets, no competitor names).
3. Add a `case.json` with `id`, `description`, `input.artifacts`,
   and `expected.{packetShape,lintResult}`.
4. Append the case to `CASE_MANIFEST` in `src/cases/index.ts`. The
   manifest is intentionally explicit (mirrors the lint rule
   registry) so we never silently load anything from disk.

## Benchmark scaffold

The `benchmark/scenarios/` directory is the placeholder for the
human-graded 10-scenario benchmark from tech spec §10.3. Real
scenarios are populated post-launch from the curated golden corpus.
