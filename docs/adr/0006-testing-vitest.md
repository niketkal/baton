# ADR 0006: Testing — vitest

- Status: Accepted
- Date: 2026-04-26

## Context

The Baton test surface includes:

- unit tests in every package
- integration tests for the compile pipeline (with a mocked LLM)
- BTN lint rule fixtures (good and bad inputs per rule)
- renderer snapshot tests
- end-to-end tests that exercise `baton failover` against a fake tool
- conformance cases shared with third-party implementers
- performance-budget tests

The test runner has to support ESM natively, run fast in CI, integrate
with TypeScript without a manual preprocess step, and have a familiar API
so contributors can read existing tests without context.

Options:

- **Jest.** Mature, large community, but ESM support is still gated
  behind `--experimental-vm-modules`-style flags and TypeScript
  integration requires `ts-jest` or `babel-jest`. Slow to start.
- **Mocha + chai + ts-node.** Composable, but lots of decisions to make
  for new contributors.
- **Node's built-in `node --test`.** Lean, but the matchers, snapshot
  story, and watch mode are thinner than developers expect.
- **vitest.** ESM-native, TypeScript via `vite`, Jest-compatible API
  (`describe` / `it` / `expect`), built-in snapshots, watch mode, and
  performance.

## Decision

Use **vitest** as the single test runner across all packages.

- Per-package configs extend a shared `vitest.config.ts` at the root.
- Snapshots live next to the tests under `packages/render/test/snapshots/`
  and similar.
- `pnpm -r test` runs the whole repo; `pnpm --filter @batonai/<pkg> test`
  runs one package.
- A custom matcher enforces performance budgets on hot paths.

## Consequences

Positive:

- ESM works without flags or transformers; matches the rest of the
  toolchain (ADR 0001, ADR 0005).
- Familiar Jest-style API — minimal onboarding cost for contributors.
- Built-in snapshot support fits the renderer test layer cleanly.
- Watch mode is fast enough for inner-loop iteration.

Negative:

- vitest is younger than Jest; some Jest-only ecosystem plugins don't
  apply. None of the missing pieces are blocking for our test surface.
- Snapshot review discipline is the same as any snapshot framework: a
  drifting snapshot needs a deliberate update with a reason in the PR.

## Related

- ADR 0001 (TypeScript on Node.js)
- ADR 0005 (bundling with tsup)
- ADR 0009 (conformance as a public asset — runner is built on the same
  test foundation)
