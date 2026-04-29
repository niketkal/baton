# Synthetic AI coding session — flaky test debugging

<!-- This is a hand-written synthetic transcript created for the Baton
conformance suite. It does not reflect any real user, repository, or
AI tool conversation. -->

## User

<!-- ts: 2026-04-26T09:00:00Z -->
The `parseDate` test in `src/date.test.ts` has been flaky on CI. It
passes locally but fails roughly one run in five on the Linux runner.
Can you help track down the cause?

## Assistant

<!-- ts: 2026-04-26T09:00:30Z -->
Flaky tests on Linux runners that pass locally on macOS often come
down to either timezone differences, locale-sensitive parsing, or a
race on shared fs state. Let me look at the failing test and the
parser implementation.

## Tool

Ran `cat src/date.test.ts` and `cat src/date.ts` — the test parses the
literal string `"3 May 2026"` and asserts month index 4, but the
implementation calls `new Date(input)` directly without a fixed
timezone.

## Assistant

The bug is timezone-dependent parsing. `new Date("3 May 2026")` is
interpreted as 00:00 UTC, but the test then reads `getMonth()` from
the LOCAL timezone, which on the Linux runner is set to UTC and on
your laptop is `America/Los_Angeles`. On L.A. time the UTC midnight
becomes 17:00 the previous day — month 3 instead of 4.

## User

That matches the failure pattern. Fix it.

## Assistant

<!-- ts: 2026-04-26T09:05:00Z -->
Two options: (1) parse with an explicit timezone, or (2) read the
date components in UTC. Option 2 is simpler and keeps the public API
unchanged. I'll switch the test to `getUTCMonth()` and add a
regression test that pins `process.env.TZ` to `Asia/Tokyo` for the
duration of the suite.

Acceptance criteria:
- `pnpm test src/date.test.ts` passes 20 consecutive runs
- The test no longer depends on the host timezone
