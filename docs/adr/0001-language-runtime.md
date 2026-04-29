# ADR 0001: Language and runtime — TypeScript on Node.js

- Status: Accepted
- Date: 2026-04-26

## Context

Baton is a CLI tool with a stable public schema, lint engine, and adapter
contract that is meant to be implemented and consumed by other tools. The
language and runtime choice has to balance:

- a broad contributor pool (so external PRs land easily)
- type safety on the schema (the packet schema is the load-bearing contract)
- distribution shape (single npm install for users; npx for first trial;
  brew for users without a Node install)
- ecosystem fit with the surrounding agent tools (most of which expose
  JS/TS-friendly hooks or wrappers)
- cross-platform reach (macOS, Linux, Windows)

Realistic alternatives:

- **Go**: excellent single-binary distribution, no runtime dependency, weak
  fit with the surrounding JS-heavy agent ecosystem; smaller pool of
  contributors comfortable with both Go and the JSON-Schema/markdown
  parsing surface area.
- **Rust**: same single-binary win as Go, plus performance, but with a
  much steeper contribution curve and longer compile times in CI.
- **Python**: strong scripting fit and large contributor pool, weak typing
  story for a normative public schema, packaging story (pip vs uv vs pipx)
  is currently noisier than npm.
- **TypeScript on Node.js**: typed, large contributor pool, idiomatic
  match for the markdown / JSON / hook ecosystems Baton integrates with,
  npm/npx is the dominant distribution channel for CLIs in this space.
  Weakest at single-binary distribution, addressable later via Node SEA or
  `pkg`.

## Decision

Use **TypeScript 5.x in strict mode** running on **Node.js 20 LTS** (with
22 supported in CI).

- ESM only in source. No CommonJS.
- `pnpm` 9.x for workspace tooling.
- `tsup` for bundling (see ADR 0005).
- `vitest` for testing (see ADR 0006).

Single-binary distribution via Node SEA or `pkg` is deferred. The npm and
brew paths cover the user audience for the OSS launch (see ADR 0007).

## Consequences

Positive:

- Generated TypeScript types directly off the JSON Schema, with `ajv` as
  the runtime validator.
- Contributors can ship a new lint rule, provider, integration, or
  renderer in one file plus a test fixture.
- npm / npx is the natural distribution path; users already have it.
- Cross-platform is straightforward; Node 20 supports macOS, Linux, and
  Windows in the same matrix.

Negative:

- A Node install is required for `npm install -g @baton/cli` and `npx`.
  Users without Node install via Homebrew (which ships a pinned Node
  binary alongside the CLI) or wait for a future single-binary
  distribution.
- Cold-start time for `npx @baton/cli failover` is bounded by Node
  startup. Mitigated by lazy-loading heavy dependencies inside the
  command function and by a CI budget test (< 5s on cold cache).
- Some users would prefer a single static binary today. Tracked as a
  post-v1 distribution option; not blocking for v1.

## Related

- ADR 0004 (monorepo with pnpm workspaces)
- ADR 0005 (bundling with tsup)
- ADR 0006 (testing with vitest)
- ADR 0007 (npm primary, brew secondary)
