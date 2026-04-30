# ADR 0004: Repo shape — monorepo with pnpm workspaces

- Status: Accepted
- Date: 2026-04-26

## Context

Baton is logically nine packages plus the CLI entry point. They share
types (the packet schema), test utilities, and tooling. They also evolve
together: a schema change typically lands across `@batonai/schema`,
`@batonai/lint`, `@batonai/compiler`, and `@batonai/cli` in one PR.

Two repo shapes were considered:

- **Polyrepo.** One package per repo, cross-repo PRs for coupled changes.
  Cleaner publish boundaries, but coupled changes become multi-PR
  coordination problems and the conformance suite has to live somewhere.
- **Monorepo.** All packages in one repo with shared tooling. Coupled
  changes are atomic, but workspace tooling has to be solid and the
  package-publish story has to handle independent versioning.

Within monorepo, the package-manager choice was between `npm` workspaces,
`yarn` Berry, and `pnpm`. `pnpm` won on:

- strict, per-package `node_modules` layout (catches accidental
  cross-package imports that bypass the public surface)
- speed on large dependency graphs
- reliable workspace filter syntax (`pnpm --filter @batonai/lint test`)
- `corepack` support for pinned versions

## Decision

Single Git repository. **pnpm 9.x workspaces.**

```
baton/
├── packages/
│   ├── schema/
│   ├── lint/
│   ├── store/
│   ├── llm/
│   ├── compiler/
│   ├── render/
│   ├── adapters/
│   ├── integrations/
│   ├── conformance/
│   └── cli/
└── …
```

- `pnpm-workspace.yaml` declares `packages/*`.
- Each package has its own `package.json` and `tsconfig.json`.
- Workspace dependencies use `workspace:*`.
- `changesets` drives versioning and publishing; packages are published
  independently to npm.

Never use `npm install` or `yarn` in this repo. The lockfile is
`pnpm-lock.yaml`.

## Consequences

Positive:

- Atomic cross-package changes (e.g. schema + lint + compiler in one PR).
- Strict isolation catches accidental imports; if `@batonai/lint` imports
  from `@batonai/store` without declaring it, the build fails.
- `pnpm --filter` makes per-package CI shards cheap.
- Single CI matrix for tests, lint, build, conformance, and
  performance-budget checks.

Negative:

- Contributors who already have `npm` muscle memory have to install pnpm
  via corepack or a global install. Documented in `CONTRIBUTING.md`.
- Each package needs its own `package.json` and entry points; more
  boilerplate than a single-package layout. Acceptable for the package
  isolation win.
- The CLI has nine workspace deps. Build order is managed by pnpm's
  topological sort; release order is managed by changesets.

## Related

- ADR 0001 (TypeScript on Node.js)
- ADR 0005 (bundling with tsup)
- ADR 0006 (testing with vitest)
