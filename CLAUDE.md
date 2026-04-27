# Baton — Claude Code project memory

You are working on Baton, a CLI-first task-state runtime that lets developers
hand off in-flight work between AI coding tools (Claude Code, Codex, Cursor)
without losing context. Baton compiles transcripts, logs, diffs, and tickets
into a structured, lint-validated "packet" that the next tool can consume.

The product spec, CLI contract, lint rules, and tech spec are normative.
Read them before making changes that touch their surface. They are at:

- `docs/spec/cli-contract.md` — normative CLI surface
- `docs/spec/lint-rules.md` — normative BTN lint rules
- `docs/spec/packet-schema.md` — human-readable schema doc
- `packages/schema/packet.schema.json` — JSON Schema, source of truth for types
- `docs/architecture.md` — public-friendly architecture
- `docs/adr/` — architecture decision records

## Repo conventions

- TypeScript 5.x strict, ESM only. No CommonJS in source. No `any` without an
  explicit comment justifying it.
- Node.js 20 LTS minimum. Test matrix covers Node 20 + 22 on macOS + Linux + Windows.
- pnpm 9.x workspaces. Never use `npm install` or `yarn` in this repo.
- Linting and formatting via `biome`. Run `pnpm biome check --apply` before
  committing.
- Tests via `vitest`. Run `pnpm -r test` for the whole repo, `pnpm --filter
  @baton/<pkg> test` for one package.
- Build via `tsup`. Run `pnpm -r build`.

## Package boundaries

The monorepo is nine packages plus the CLI entry. Each has a narrow
responsibility. Do not break the boundaries:

- `@baton/schema` — JSON Schema + generated types. Schema is source of truth;
  types are generated via `pnpm --filter @baton/schema codegen`. Never hand-edit
  the generated types.
- `@baton/lint` — BTN rule engine. Each rule is a file under `rules/`. Rule
  registration is **explicit** in `rules/index.ts` — one import per rule. No
  glob imports. The trade-off (one extra import line per rule) is deliberate.
- `@baton/store` — repo-local state. **Files are canonical**; SQLite is a
  rebuildable index. Code that treats SQLite as canonical is a bug.
- `@baton/llm` — BYOK provider abstraction. The compiler imports the registry,
  never a specific provider. Anthropic and OpenAI providers ship in v1.
- `@baton/compiler` — artifact ingestion + compile pipeline. Two modes:
  `--fast` (deterministic, no LLM call, uses cached extractions) and `--full`
  (LLM-driven synthesis). Hooks default to `--fast`. User-driven handoff
  preparation defaults to `--full`.
- `@baton/render` — target-specific renderers (`claude-code`, `codex`,
  `cursor`, `generic`). Renderers are pure functions of (packet, hints).
- `@baton/adapters` — `file`, `stdout`, `shell`, `clipboard` for v1.
  `github-comment` is **deferred to v1.5** alongside Cloud's GitHub integration.
  Do not implement it in v1.
- `@baton/integrations` — per-tool hook installers. v1 ships native hook for
  Claude Code, wrapper launcher for Codex CLI, paste fallback for Cursor.
  Every integration must implement `dryRun()` and `uninstall()`.
- `@baton/conformance` — public test suite. Cases are synthetic fixtures only.
  No real partner transcripts in this package.
- `@baton/cli` — user-facing CLI. Commands include `init`, `uninstall`,
  `compile`, `failover`, `lint`, `render`, `dispatch`, `outcome`, `status`,
  `history`, `migrate`, `conformance`.

## Critical invariants

These rules must not be broken without an ADR justifying the change:

1. **Files canonical, SQLite cache.** Every packet exists as a directory under
   `.baton/packets/<id>/` with `packet.json`, `packet.md`, `warnings.json`,
   `provenance.json`. SQLite (`state.db`) is rebuilt by walking the file tree
   if missing.

2. **`baton failover` must stay fast.** The happy-path budget is < 5s on a warm
   cache. The implementation must NOT make a live LLM call in `--fast` mode.
   If a cache miss forces a live call, the local log records `fell_back_to_full:
   true` so the regression is observable.

3. **Local logs hold metadata only.** Raw artifact content, transcript spans,
   prompt text, packet narrative fields, and BTN060-flagged values never enter
   `.baton/logs/*` at default log levels. All log calls go through
   `redactForLog()` in `@baton/cli/output/`. A CI grep check (`pnpm --filter
   @baton/cli lint:logs`) enforces this. The only exception is
   `BATON_LOG_LEVEL=debug-unsafe`, which requires explicit env-var opt-in,
   prints a startup banner, and tags every line `{ unsafe: true }`.

4. **Schema and lint rules are normative public interfaces.** Schema is CC0;
   code is Apache-2.0. Schema changes require an ADR. Lint rule changes require
   updating both the rule file and the test fixture in
   `packages/lint/test/fixtures/`.

5. **No competitor names in user-facing strings.** Comments, docs, error
   messages, and README copy must not name `cli-continues`, `hydra`, `Signet`,
   or other comparable products. Comparison content lives only on the marketing
   site (separate repo). README and CLI output describe what Baton does, not
   what others don't.

6. **No long-lived secrets in the repo.** No `NPM_TOKEN`, no
   `HOMEBREW_GITHUB_TOKEN`, no LLM provider keys. Releases use OIDC trusted
   publishing. CI tests use mocks.

## Testing discipline

- Performance budgets are enforced in CI under `ci / performance-budget`.
  Adjusting a budget requires a code-owner approval recorded in the PR.
- BTN001–BTN060 each ship with at least one known-good and one known-bad
  fixture in `packages/lint/test/fixtures/`.
- Conformance cases live in `packages/conformance/cases/` as JSON files
  describing input artifacts, expected packet shape, expected lint result.
- The "beats hand-written" benchmark lives at
  `packages/conformance/benchmark/` and is the public-launch gate.

## Branch and commit hygiene

- Squash-merge to `main`. Linear history.
- Signed commits required.
- Conventional commit messages: `feat(lint): add BTN060 secret scrubbing`.
- No competitive framing in commit messages. Use `feat: implement BTN060` not
  `feat: implement BTN060 to differentiate from cli-continues`.
- Every PR runs `ci / test`, `ci / lint`, `ci / build`, `ci / conformance`,
  `ci / performance-budget`, `ci / secrets-scan`. All must pass.

## Before committing

Run `pnpm -r test` and `pnpm biome check --apply`. If either fails, fix
before committing. Do not commit broken state to make a PR description
look smaller.

## When you (Claude Code) are uncertain

- If a change touches the schema, lint rule set, or CLI contract, surface the
  change as a question rather than a silent edit. Those are normative public
  interfaces.
- If a change might affect a performance budget, run the perf tests locally
  first and report the delta.
- If a request would name a competitor in user-facing copy, push back and
  suggest framing without the comparison.
- If you don't know whether a file is in `packages/conformance/cases/`
  (synthetic, public) vs `corpus/` (real, anonymized, may be private), assume
  the stricter posture.

## Common workflows

- New lint rule: file under `packages/lint/rules/BTN<NNN>-<name>.ts` +
  fixture under `packages/lint/test/fixtures/` + add an explicit import to
  `packages/lint/rules/index.ts`.
- New LLM provider: file under `packages/llm/providers/<name>.ts` implementing
  `LLMProvider` + register in `packages/llm/registry.ts` + add provider SDK
  as an optional peer dep in `packages/cli/package.json`.
- New tool integration: folder under `packages/integrations/<id>/` with
  `detect`, `modes`, `install`, `uninstall`, `dryRun`, `status` + register in
  `packages/integrations/registry.ts` + update the integration matrix in
  `docs/spec/cli-contract.md`.
- New renderer target: file under `packages/render/targets/<name>.ts` + snapshot
  fixtures under `packages/render/test/snapshots/`.

## Read these before making structural changes

- `docs/architecture.md` for the layered architecture
- `docs/adr/0001-language-runtime.md` and `docs/adr/0002-byok-llm-providers.md`
  for the foundational decisions
- The week-by-week build plan in `docs/architecture.md` for what's expected
  when

If you're about to do something that doesn't fit any of the above, propose
an ADR draft first.

## Read-only internal context

The folder `~/Projects/Ideas/baton/` is internal strategy context
(viability reviews, competitor map, monetization plan, cloud spec, pricing,
the source `baton-packet.schema.json`, MVP and tech specs). You may read
from it for background but never write to it, never copy from it directly
into public-facing docs (rewrite fresh per the GitHub setup), and never
reference it in commit messages, ADRs, or any file that ends up in this
repo's git history.
