# ADR 0005: Bundling — tsup with ESM dual output

- Status: Accepted
- Date: 2026-04-26

## Context

Each `@batonai/*` package ships compiled JavaScript and `.d.ts` declarations
to npm. The bundler choice has to handle:

- ESM output (the source is ESM-only)
- TypeScript declarations
- multi-entry packages (e.g. `@batonai/cli` has a binary entry plus a
  programmatic API)
- fast incremental builds (developers run `pnpm -r build` often)
- one config per package, not a wall of webpack/rollup configuration

Realistic options:

- **`tsc` only.** Cleanest path for type emission; no bundling, so users
  pay for many small file resolutions at install/import time.
- **Rollup + plugins.** Powerful, but configuration-heavy and slower to
  iterate on; declarations need a separate plugin.
- **esbuild directly.** Very fast, but no built-in declaration emission;
  contributors have to wire `tsc --emitDeclarationOnly` in parallel.
- **`tsup`.** Thin wrapper over esbuild that handles ESM output, declaration
  emission, multi-entry, watch mode, and per-package configuration in a
  single small file.

## Decision

Use **`tsup`** for every `@batonai/*` package.

- Each package has a single `tsup.config.ts` (or a default config).
- Output: ESM with declarations. CommonJS dual output is enabled only
  where a package's consumers concretely need CJS; the source stays
  ESM-only.
- `pnpm -r build` runs tsup across the workspace topologically.

## Consequences

Positive:

- Fast incremental builds. tsup + esbuild keeps `pnpm -r build` in the
  low single-digit seconds on a warm cache.
- Declarations ship alongside the bundles, so types-only consumers and
  IDE tooling work without extra configuration.
- A single small config per package keeps the configuration surface
  reviewable.

Negative:

- We are pinned to esbuild's TypeScript handling, which is intentionally
  not the same as `tsc`. Mitigated by running `tsc --noEmit` in CI for
  full type checking.
- Edge cases (decorators, unusual `tsconfig` flags) need workarounds
  occasionally. Documented per-package as needed.
- A future need for very granular bundle splitting could outgrow tsup;
  that would be revisited as a separate ADR.

## Related

- ADR 0001 (TypeScript on Node.js)
- ADR 0004 (monorepo with pnpm workspaces)
- ADR 0006 (testing with vitest, ESM-native)
