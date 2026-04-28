# Synthetic AI coding session — implementing a new feature

<!-- Hand-written synthetic transcript for the Baton conformance
suite. Not derived from any real user or AI tool conversation. -->

## User

<!-- ts: 2026-04-26T11:00:00Z -->
We need to add a `--dry-run` flag to the `widget export` command. It
should print the planned actions without writing any files.
Constraint: must not regress the existing `widget export` exit codes
or stdout shape, since several scripts pipe its output.

## Assistant

<!-- ts: 2026-04-26T11:00:45Z -->
Plan:
1. Add the `--dry-run` flag in `src/commands/export.ts` (commander
   option).
2. Thread a `dryRun: boolean` through the `runExport` function.
3. Replace each filesystem mutation with a guarded call: when dryRun
   is true, log "would write <path>" instead.
4. Existing exit codes (0 success, 1 user error, 2 internal error)
   stay the same.

I'll keep stdout output identical in non-dry-run mode so downstream
scripts are not affected.

## User

Sounds right. Go ahead.

## Assistant

<!-- ts: 2026-04-26T11:05:00Z -->
Implemented. Changes:
- `src/commands/export.ts`: added `--dry-run` flag, default false.
- `src/export/run.ts`: guarded `writeFileSync` and `mkdirSync`.
- `test/export.dry-run.test.ts`: new test asserting no fs writes
  when dry-run is set, plus parity of stdout against a non-dry-run
  baseline.

Acceptance criteria:
- `widget export --dry-run` prints the same per-file lines as a
  normal export but writes nothing to disk
- Exit code is 0 on success regardless of dry-run

Open question: should `--dry-run` imply `--quiet=false` (force
verbose), or honour an explicit `--quiet`? Defaulting to honour for
now.
