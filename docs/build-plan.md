# Baton v1 — Build Plan

> **For agentic workers:** Each session below is one focused Claude Code conversation. Execute in order. Reference [the internal tech spec](../../Ideas/baton/baton-tech-spec.md), [MVP spec](../../Ideas/baton/baton-mvp-spec.md), [CLI contract](../../Ideas/baton/baton-cli-contract.md), and [lint rules](../../Ideas/baton/baton-lint-rules.md) as canonical sources. CLAUDE.md at the repo root is loaded automatically and contains the package boundaries and critical invariants every session must respect.

**Goal:** Ship Baton OSS v1 — CLI-first task-state runtime that compiles transcripts, logs, diffs, and tickets into a lint-validated "packet" that the next AI tool can consume.

**Architecture:** TypeScript 5.x strict, ESM-only, Node 20+, pnpm 9 workspaces, 10 narrow `@baton/*` packages with explicit dependencies. Files canonical, SQLite as rebuildable cache. BYOK LLM (Anthropic + OpenAI in v1). Per-tool integrations: Claude Code native hook → Codex wrapper launcher → Cursor paste fallback.

**Tech stack:** TypeScript 5.7, vitest 2.1, tsup 8.3, biome 1.9, commander 12, ajv 8, better-sqlite3 12, unified/remark, simple-git, pino, clipboardy, `@anthropic-ai/sdk` + `openai` (optional peer deps), changesets.

**Source of truth:**
- Schema: `packages/schema/packet.schema.json` (CC0)
- Lint rules: `~/Projects/Ideas/baton/baton-lint-rules.md` (BTN001–BTN060 with severities)
- CLI surface: `~/Projects/Ideas/baton/baton-cli-contract.md`
- Architecture: `~/Projects/Ideas/baton/baton-tech-spec.md` §2

---

## Status

| # | Session | Status | Commit |
|---|---|---|---|
| 1 | Monorepo scaffold | ✅ | `396e964` |
| 2 | `@baton/schema` — ajv validator + codegen | ✅ | `ad57d9e` |
| 3 | `@baton/store` — files-canonical + SQLite cache | ✅ | `da91bf8` |
| 4 | `@baton/lint` — engine + first 6 BTN rules | ⏳ next |
| 5 | `@baton/llm` — provider abstraction + cache | ⏳ |
| 6 | `@baton/compiler` skeleton — pipeline + parsers + transcript parser | ⏳ |
| 7 | `@baton/render` — generic + claude-code targets | ⏳ |
| 8 | `@baton/cli` — commander scaffold + 5 commands wired (week-1 demo gate) | ⏳ |
| 9 | Provenance + remark round-trip + selectively editable packet.md | ⏳ |
| 10 | BTN015–BTN040 (provenance, freshness, repo-context, BTN060 secrets) | ⏳ |
| 11 | LLM extraction prompts (objective, attempts, AC, next-action) + cost reporting | ⏳ |
| 12 | Renderers: codex + cursor + snapshot tests + token estimation | ⏳ |
| 13 | Repo awareness: git refs, dirty-state, freshness scoring | ⏳ |
| 14 | `@baton/integrations/claude-code` native hook + `baton init`/`uninstall` | ⏳ |
| 15 | `@baton/integrations/codex` wrapper launcher + Cursor paste flow + `baton outcome` | ⏳ |
| 16 | BTN041–BTN050 dispatch-gating rules + `baton dispatch` + `baton history` | ⏳ |
| 17 | `@baton/conformance` — runner + 5–10 reference cases | ⏳ |
| 18 | Performance budgets in CI + `baton failover` end-to-end + cold-start optimization | ⏳ |
| 19 | `baton migrate` skeleton + Homebrew formula + npm publish workflow | ⏳ |
| 20 | Docs polish: README, CONTRIBUTING, 4 contributor guides, ADRs 0001–0010 | ⏳ |

Pre-flip-public checklist (after Session 20): `SECURITY.md`, `CODEOWNERS`, branch protection on `main`, npm `@baton` org, npm trusted publishing config, GitHub Environment for `npm-publish`, pre-flip grep for competitor names / commercial framing.

---

## Session 4 — `@baton/lint` engine + first 6 rules

**Tech spec:** §4.1 (`@baton/lint`), §5.5 (lint rule interface), §15 week 2.

**Files to create:**
- `packages/lint/src/types.ts` — `LintRule`, `LintReport`, `LintError`, `LintWarning`, `LintContext`, `Severity`
- `packages/lint/src/engine.ts` — `lint(packet, ctx, opts) → LintReport`
- `packages/lint/src/rules/index.ts` — explicit imports of every rule (no glob)
- `packages/lint/src/rules/BTN001-required-fields.ts` — schema-level required fields present
- `packages/lint/src/rules/BTN002-id-format.ts` — packet `id` matches `^[a-z0-9-]+$`
- `packages/lint/src/rules/BTN003-status-valid.ts` — `status` ∈ enum
- `packages/lint/src/rules/BTN004-validation-level-coherent.ts` — `validation_level` consistent with status
- `packages/lint/src/rules/BTN005-objective-non-empty.ts` — objective text > 10 chars
- `packages/lint/src/rules/BTN060-secret-scrubbing.ts` — uses heuristics in `secrets/`
- `packages/lint/src/secrets/prefixes.ts` — `sk-`, `sk-ant-`, `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `AKIA`, `ASIA`, `xox[bp]-`
- `packages/lint/src/secrets/detect.ts` — prefix + PEM + `.env`-style + high-entropy detection
- `packages/lint/src/index.ts` — re-exports
- `packages/lint/test/fixtures/BTN<NNN>-<name>/{good,bad}/packet.json` — one each per rule
- `packages/lint/test/engine.test.ts` — exercises each rule against fixtures

**Deliverables:**
- `lint(packet)` returns typed report, never throws
- Strict mode (`opts.strict: true`) flips `failInStrict` rules from warnings to errors
- 6 rules ship with good/bad fixtures
- CLAUDE.md invariant satisfied: explicit imports in `rules/index.ts` (one per rule)

**Verification:**
```bash
pnpm --filter @baton/lint typecheck
pnpm --filter @baton/lint build
pnpm --filter @baton/lint test
```
All green; coverage shows every fixture asserted.

**Commit:** `feat(lint): implement engine + 6 BTN rules with secret scrubbing`

**Session 4 prompt (paste verbatim into a fresh `claude` session in the repo root):**
```
Session 4 of docs/build-plan.md. Implement @baton/lint per CLAUDE.md
package boundaries.

Build the BTN rule engine plus the first 6 rules: BTN001-BTN005 (covered
in baton-lint-rules.md, ~/Projects/Ideas/baton/baton-lint-rules.md) and
BTN060 (secret scrubbing — see tech spec §13.2 for the heuristic list).

Per CLAUDE.md:
- LintRule interface in src/types.ts: { code, severity, failInStrict,
  description, check(packet, ctx) → LintRuleResult }
- Each rule a file under src/rules/BTN<NNN>-<name>.ts
- Explicit imports in src/rules/index.ts (no glob — that's the deliberate
  trade-off for predictable bundling and tree-shaking)
- Each rule ships at least one known-good and one known-bad fixture
  under test/fixtures/BTN<NNN>-<name>/{good,bad}/packet.json
- secrets/{prefixes.ts, detect.ts} as described in tech spec §13.2

Use the @baton/schema validatePacket and Packet type (workspace dep
already wired). Use the @baton/store layout if it helps for fixtures.

Stop when `pnpm --filter @baton/lint build && pnpm --filter @baton/lint
test` is green. Show me which rules you implemented, the diff, and a
recommended commit message.
```

---

## Session 5 — `@baton/llm` provider abstraction + cache

**Tech spec:** §4.1 (`@baton/llm`), §7 (LLM strategy), §13.3 (data minimization).

**Files to create:**
- `packages/llm/src/types.ts` — `LLMProvider`, `CompleteOptions`, `CompleteResult`, `LLMConfig`
- `packages/llm/src/providers/anthropic.ts` — `@anthropic-ai/sdk` wrapper
- `packages/llm/src/providers/openai.ts` — `openai` SDK wrapper
- `packages/llm/src/providers/none.ts` — stub that throws on call
- `packages/llm/src/providers/mock.ts` — deterministic mock for tests
- `packages/llm/src/registry.ts` — selects provider per §7.1 order
- `packages/llm/src/cache.ts` — content-addressable cache (sha256 of provider+model+prompt+system+temp); LRU 200MB; lives at `.baton/llm-cache/`
- `packages/llm/src/tokens.ts` — `js-tiktoken` for OpenAI, `@anthropic-ai/tokenizer` for Anthropic
- `packages/llm/test/registry.test.ts`, `cache.test.ts`, `mock-provider.test.ts`

**Add deps:** `@anthropic-ai/sdk`, `openai`, `js-tiktoken`, `@anthropic-ai/tokenizer` as **optional peer deps** of `@baton/llm` so they tree-shake out for users not using them. Lazy-load inside the provider files (don't top-level import — affects npx cold start per tech spec §9.2).

**Deliverables:**
- `getProvider(config)` returns a configured provider; missing SDK → friendly error
- `cache.get(key)` / `cache.set(key, value)` work against `.baton/llm-cache/`
- Mock provider used by all subsequent sessions' tests; no real network calls in CI

**Verification:**
```bash
pnpm --filter @baton/llm test    # uses mock provider, no network
pnpm --filter @baton/llm build   # builds without optional peer deps installed
```

**Commit:** `feat(llm): provider abstraction with anthropic, openai, none, mock + cache`

**Prompt:**
```
Session 5 of docs/build-plan.md. Implement @baton/llm per tech spec §4.1
+ §7 (~/Projects/Ideas/baton/baton-tech-spec.md).

Build the BYOK provider abstraction (anthropic, openai, none, mock),
content-addressable cache for completions, token estimation, and
provider registry per §7.1 selection order.

Critical: SDKs are optional peer deps, lazy-loaded INSIDE provider
files. Never top-level import @anthropic-ai/sdk or openai — it breaks
the npx cold-start budget (tech spec §9.2).

The mock provider is used by every later session's tests. Make it
deterministic (same input → same output), supports replay from a
fixtures dir.

Stop when `pnpm --filter @baton/llm build && pnpm --filter @baton/llm
test` is green. Show diff + commit message.
```

---

## Session 6 — `@baton/compiler` skeleton + transcript parser + pipeline

**Tech spec:** §4.1 (`@baton/compiler`), §15 week 1 (week-1 demo gate).

**Files to create:**
- `packages/compiler/src/types.ts` — `CompileOptions`, `CompileResult`, `ArtifactRef`
- `packages/compiler/src/pipeline.ts` — orchestrates the 7-step pipeline (per MVP spec §workflow)
- `packages/compiler/src/parsers/transcript.ts` — Claude Code transcript markdown parser
- `packages/compiler/src/parsers/index.ts` — explicit imports
- `packages/compiler/src/modes.ts` — `--fast` (deterministic + cache) vs `--full` (deterministic + LLM); for now, `--fast` only
- `packages/compiler/src/freshness.ts` — placeholder; full implementation in Session 13
- `packages/compiler/src/repo.ts` — placeholder
- `packages/compiler/src/index.ts` — `compile(opts)` exported
- `packages/compiler/test/fixtures/transcript-claude-code-01.md` — real-shaped Claude transcript fixture
- `packages/compiler/test/pipeline.test.ts` — fixture transcript → packet that passes lint

**Add deps:** `unified`, `remark-parse`, `remark-stringify`, `parse-diff`, `simple-git`, `smol-toml`.

**Deliverables:**
- `compile({ packet: 'demo', repo: '/tmp/...', mode: 'fast', artifacts: [{ type: 'transcript', uri: '...' }] })` returns a packet that validates against `@baton/schema` and passes the 6 BTN rules from Session 4.
- Pipeline walks: ingest → normalize → assemble → validate → return.

**Verification:**
```bash
pnpm --filter @baton/compiler test
pnpm --filter @baton/lint test          # still passes (no regression)
pnpm --filter @baton/schema test         # still passes
```

**Commit:** `feat(compiler): pipeline skeleton + claude-code transcript parser + fast mode`

---

## Session 7 — `@baton/render` (generic + claude-code) + snapshot tests

**Tech spec:** §4.1 (`@baton/render`), §15 week 1 + week 3.

**Files to create:**
- `packages/render/src/types.ts` — `Renderer`, `RenderTarget`, `RenderResult`, `RenderHints`, `RenderWarning`
- `packages/render/src/templates/sections.ts` — shared markdown section helpers
- `packages/render/src/targets/generic.ts` — neutral, shareable
- `packages/render/src/targets/claude-code.ts` — richer structured context
- `packages/render/src/targets/index.ts` — explicit imports
- `packages/render/src/index.ts` — `render(packet, target, hints?)` exported
- `packages/render/test/snapshots/generic-fixture-01.md.snap`
- `packages/render/test/snapshots/claude-code-fixture-01.md.snap`
- `packages/render/test/render.test.ts`

**Deliverables:**
- Pure function: same packet → same output per target (snapshot-stable)
- Token estimate populated using `@baton/llm/tokens` (cross-package wire)

**Verification:**
```bash
pnpm --filter @baton/render test
```

**Commit:** `feat(render): generic + claude-code targets with snapshot tests`

---

## Session 8 — `@baton/cli` scaffold + week-1 demo gate

**Tech spec:** §4.1 (`@baton/cli`), §9.2 (npx cold start), §15 week 1 gate.

**Files to create:**
- `packages/cli/src/bin.ts` — shebang entry; lazy-loads commander, dispatches
- `packages/cli/src/commands/init.ts` — stub that creates `.baton/`
- `packages/cli/src/commands/ingest.ts` — `baton ingest transcript <path>` writes to `.baton/artifacts/`
- `packages/cli/src/commands/compile.ts` — wraps `@baton/compiler.compile`
- `packages/cli/src/commands/render.ts` — wraps `@baton/render.render`
- `packages/cli/src/commands/failover.ts` — first-class macro per CLI contract §8.2.1; orchestrates ingest → compile --fast → lint --non-strict → render → adapter
- `packages/cli/src/output/redact.ts` — `redactForLog()` per CLAUDE.md invariant 3 + tech spec §12.2.1
- `packages/cli/src/output/json.ts` — `--json` mode for every command
- `packages/cli/src/output/human.ts` — pretty stdout
- `packages/cli/src/config.ts` — loads `.baton/config.toml`
- `packages/cli/src/index.ts` — `main(argv) → exit_code` exported (per tech spec §19)
- `packages/cli/scripts/lint-logs.mjs` — grep check enforcing every `logger.*` goes through `redactForLog`
- `packages/cli/test/e2e/failover.test.ts` — runs `baton failover` against a fixture transcript in a temp dir

**Add deps:** `commander`, `pino`, `clipboardy`. **Optional peer deps** for LLM SDKs at the CLI level, per tech spec §9.1.

**Add `bin` field** to `packages/cli/package.json`: `"baton": "./dist/bin.js"`.

**Deliverables (week-1 gate per tech spec §15):**
- `npx -y --workspace @baton/cli baton failover --from claude-code --to codex --packet demo` (or equivalent local pnpm-link invocation) runs end-to-end on the fixture and produces a `BATON.md`.
- `baton --version` cold start < 200ms (no LLM SDK imports).
- E2E test in `test/e2e/` passes.
- `lint:logs` script catches a deliberate violation (test commits a bad call, script flags it, then revert).

**Verification:**
```bash
pnpm -r build
pnpm --filter @baton/cli test
pnpm --filter @baton/cli lint:logs
node packages/cli/dist/bin.js --version
time node packages/cli/dist/bin.js --version    # < 200ms warm
```

**Commit:** `feat(cli): commander scaffold + failover macro + redact contract (week-1 demo gate)`

---

## Session 9 — Provenance links + remark-based selectively editable `packet.md`

**Tech spec:** §6.1 (selectively editable packet.md), §15 week 2.

**Files to create/modify:**
- `packages/store/src/markdown.ts` — extend with read-only fenced sections (`<!-- baton:read-only -->` … `<!-- /baton:read-only -->`)
- `packages/compiler/src/provenance.ts` — span_start/span_end tracking through the unified AST
- `packages/store/src/markdown-edit.ts` — detects edits inside read-only sections; rejects on next compile with clear error
- `packages/compiler/src/extract/ast-spans.ts` — span tracking helper used by every parser
- `packages/store/test/markdown-roundtrip.test.ts` — narrative subset round-trips losslessly
- `packages/store/test/markdown-readonly-rejection.test.ts` — edit inside read-only section is rejected

**Deliverables:**
- Editing `objective`, `current_state`, `next_action`, AC text, constraints text, open_questions text in `packet.md` round-trips into `packet.json` on next compile.
- Edits inside read-only sections rejected with error pointing to `packet.json`.
- Provenance links generated for every span the compiler reads from a transcript artifact.

**Verification:**
```bash
pnpm --filter @baton/store test
pnpm --filter @baton/compiler test
```

**Commit:** `feat(store,compiler): selectively editable packet.md + provenance spans`

---

## Session 10 — BTN015–BTN040 (provenance, freshness, repo-context) + finalize BTN060

**Tech spec:** §13.2 (BTN060), `~/Projects/Ideas/baton/baton-lint-rules.md` for rule list.

**Files to create:**
- One file per rule under `packages/lint/src/rules/BTN<NNN>-<name>.ts` for BTN006–BTN040 (excluding the dispatch-gating BTN041–050 which land in Session 16)
- One good/bad fixture pair per rule
- Append explicit imports to `packages/lint/src/rules/index.ts`
- Tighten `secrets/detect.ts` to handle high-entropy detection per §13.2

**Deliverables:**
- Roughly 35 new rules (BTN006–BTN040)
- Confidence score calculation per MVP spec
- Each rule has known-good and known-bad fixture
- Strict mode behavior matches `failInStrict` flags

**Verification:** `pnpm --filter @baton/lint test` — all rules + fixtures green.

**Commit:** `feat(lint): implement BTN006-BTN040 with fixtures`

---

## Session 11 — LLM extraction prompts + `--full` mode + cost reporting

**Tech spec:** §7.2 (extraction steps), §7.3 (prompt discipline), §7.5 (cost transparency).

**Files to create:**
- `packages/compiler/src/extract/prompts/objective.md`
- `packages/compiler/src/extract/prompts/attempts.md`
- `packages/compiler/src/extract/prompts/acceptance-criteria.md`
- `packages/compiler/src/extract/prompts/next-action.md`
- `packages/compiler/src/extract/objective.ts` — calls LLM, parses JSON, retries once on parse failure
- `packages/compiler/src/extract/attempts.ts`
- `packages/compiler/src/extract/acceptance-criteria.ts`
- `packages/compiler/src/extract/next-action.ts`
- `packages/compiler/src/extract/index.ts`
- `packages/compiler/test/fixtures/extract/<step>/{input.json,expected.json}` — golden corpus for each step
- `packages/cli/src/output/cost-report.ts` — emits the structured event from §12.3

**Modify:**
- `packages/compiler/src/modes.ts` — wire `--full` to call extractors via `@baton/llm`
- `packages/cli/src/commands/compile.ts` — add `--full` flag; emit cost block after run

**Deliverables:**
- `compile --full` calls 4 extractors, uses cache for subsequent runs (per §7.4)
- Each extractor uses structured output (JSON mode) and retries once on parse failure
- Failed parse becomes a packet warning, not a crash
- Cost block printed to stderr matches §7.5 example
- All compiler tests use the mock provider; no real network in CI

**Verification:**
```bash
pnpm --filter @baton/compiler test
pnpm --filter @baton/cli test
```

**Commit:** `feat(compiler): full mode with 4 LLM extractors + cost reporting`

---

## Session 12 — Renderers: codex + cursor + token estimation wire-up

**Tech spec:** §4.1 (`@baton/render`).

**Files to create:**
- `packages/render/src/targets/codex.ts` — direct task framing, tighter brevity
- `packages/render/src/targets/cursor.ts` — concise action framing, files first
- `packages/render/test/snapshots/codex-fixture-01.md.snap`, `cursor-fixture-01.md.snap`

**Modify:**
- `packages/render/src/targets/index.ts` — explicit imports for both new targets
- `packages/render/src/types.ts` — extend `RenderTarget` enum

**Deliverables:**
- All 4 renderers produce stable snapshots from the same fixture packet
- Token estimate populated via `@baton/llm/tokens` for the active provider

**Verification:** `pnpm --filter @baton/render test`.

**Commit:** `feat(render): add codex + cursor targets`

---

## Session 13 — Repo awareness: git refs + dirty-state + freshness scoring

**Tech spec:** §15 week 4 (repo attachment).

**Files to create/modify:**
- `packages/compiler/src/repo.ts` — real implementation (replaces Session 6 placeholder); uses `simple-git`
- `packages/compiler/src/freshness.ts` — real implementation per BTN014 (stale-context detection)
- `packages/compiler/test/repo.test.ts` — uses temp git repos
- `packages/compiler/test/freshness.test.ts`

**Deliverables:**
- `repo.attach({ root })` returns `{ commit, branch, dirty, untracked, fileExists() }`
- Freshness score per artifact: 1.0 (this session) → 0 (>7 days)
- Wires into the packet's `repo_context` block

**Verification:** `pnpm --filter @baton/compiler test`.

**Commit:** `feat(compiler): repo attachment + freshness scoring`

---

## Session 14 — `@baton/integrations/claude-code` + `baton init` + `baton uninstall`

**Tech spec:** §4.1 (`@baton/integrations`), §8.1, §13.1, §15 week 4.

**Files to create:**
- `packages/integrations/src/types.ts` — `Integration`, `IntegrationMode`, `InstallPlan`, `DetectResult`, `InstallOpts`, `IntegrationStatus`
- `packages/integrations/src/registry.ts` — explicit list
- `packages/integrations/src/claude-code/compat.ts` — versioned table of `{ claudeCodeVersion, pluginDir, hookFormat }`
- `packages/integrations/src/claude-code/detect.ts` — invokes `claude --version`, falls back to PATH lookup
- `packages/integrations/src/claude-code/install.ts` — writes plugin files, records in `.baton/integrations/installed.json`
- `packages/integrations/src/claude-code/uninstall.ts` — restores backups, removes hook files, rewrites `installed.json`
- `packages/integrations/src/claude-code/dry-run.ts` — returns `InstallPlan` without modifying anything
- `packages/integrations/src/claude-code/probe.ts` — probes `~/.claude/plugins/`, `~/.config/claude/plugins/`, `claude --print-plugin-dir`
- `packages/integrations/src/claude-code/plugin/` — minimal Claude Code plugin manifest + hook scripts
- `packages/integrations/test/claude-code/install-uninstall-roundtrip.test.ts` — pre-snapshot, install, uninstall, post-snapshot, assert identical
- `packages/cli/src/commands/init.ts` — real implementation; per-integration confirmation; `--yes`, `--dry-run`
- `packages/cli/src/commands/uninstall.ts` — `<integration>` and `--all`; `--dry-run` previews; reads `installed.json`

**Add dep:** none new (uses Node fs only).

**Deliverables (week-4 gate):**
- `baton init --dry-run` prints an `InstallPlan` and exits 0 without modifying anything
- `baton init` (interactive) installs the Claude Code plugin
- `baton uninstall claude-code` reverses the install completely; file-tree comparison test asserts equivalence to pre-install snapshot
- `baton uninstall --all` does the same for every installed integration

**Verification:**
```bash
pnpm --filter @baton/integrations test
pnpm --filter @baton/cli test
```

**Commit:** `feat(integrations,cli): claude-code native hook + init/uninstall round-trip`

---

## Session 15 — `@baton/integrations/codex` wrapper + Cursor paste flow + `baton outcome`

**Tech spec:** §8.2, §8.3, §15 week 5.

**Files to create:**
- `packages/integrations/src/codex/wrapper.ts` — `baton-codex` shim spawns `codex` subprocess, watches stdout for limit markers
- `packages/integrations/src/codex/markers.ts` — list of known limit-marker regexes
- `packages/integrations/src/codex/install.ts` — places shim in user-chosen directory; never modifies PATH without consent
- `packages/integrations/src/codex/uninstall.ts`
- `packages/integrations/src/cursor/paste.ts` — paste-friendly fallback (no install)
- `packages/cli/src/commands/outcome.ts` — `baton outcome ingest <path>`; classifier heuristic
- `packages/cli/src/commands/dispatch.ts` — orchestrates render + adapter delivery; emits dispatch event into store
- `packages/integrations/test/codex/wrapper-marker-detection.test.ts` — pipes a fake `codex` output through the wrapper
- `packages/cli/test/outcome.test.ts` — outcome JSON is parsed and stored

**Modify:**
- `packages/cli/src/commands/init.ts` — detect Codex / Cursor; offer their respective install modes

**Deliverables:**
- Wrapper successfully detects limit markers in a fake-codex test process
- `baton outcome ingest` writes to `.baton/packets/<id>/outcomes/` and updates store
- Cursor paste path documented + tested via `pbpaste | baton ingest transcript -` (test uses stdin)

**Verification:** `pnpm --filter @baton/integrations test && pnpm --filter @baton/cli test`.

**Commit:** `feat(integrations,cli): codex wrapper + cursor paste + outcome ingestion`

---

## Session 16 — BTN041–BTN050 dispatch-gating rules + `baton history`

**Tech spec:** §15 week 5; full rule list in `~/Projects/Ideas/baton/baton-lint-rules.md`.

**Files to create:**
- One file per rule under `packages/lint/src/rules/BTN<NNN>-<name>.ts` for BTN041–BTN050 (e.g. `ready_requires_validation_level_ready`, `approval_policy_respected`, `dispatch_allowed_policy_respected`, `blocking_warnings_gate_dispatch`)
- Good/bad fixture pair per rule
- Append explicit imports to `packages/lint/src/rules/index.ts`
- `packages/cli/src/commands/history.ts` — packet versions, dispatches, outcomes from store
- `packages/cli/test/history.test.ts`

**Deliverables (week-5 gate):**
- All BTN001–BTN060 implemented with fixtures
- `baton dispatch` blocked by failing dispatch-gating rules
- `baton history` shows version timeline

**Verification:** `pnpm -r test` — full suite green.

**Commit:** `feat(lint,cli): BTN041-BTN050 dispatch-gating + history command`

---

## Session 17 — `@baton/conformance` runner + 5–10 reference cases

**Tech spec:** §4.1 (`@baton/conformance`), §10.3 (beats hand-written benchmark scaffolding).

**Files to create:**
- `packages/conformance/src/types.ts` — `ConformanceCase`, `ConformanceResult`, `ConformanceReport`
- `packages/conformance/src/runner.ts` — runs cases against any binary that exposes the standard CLI surface
- `packages/conformance/src/report.ts` — produces public report (passing/failing case names)
- `packages/conformance/cases/<name>/case.json` — input artifacts, expected packet shape, expected lint result
- `packages/conformance/cases/<name>/artifacts/` — synthetic transcripts, logs, diffs (NO real partner content per CLAUDE.md)
- `packages/conformance/bin/baton-conformance.ts` — `npx @baton/conformance --against ./bin`
- `packages/conformance/test/runner.test.ts`
- `packages/conformance/benchmark/scenarios/` — scaffold for the 10-scenario human benchmark (real cases populated post-launch)
- `packages/cli/src/commands/conformance.ts` — wraps the runner

**Deliverables:**
- 5–10 synthetic reference cases pass against the local `@baton/cli` binary
- `npx @baton/conformance --against ./node_modules/.bin/baton` works
- `baton conformance` exits 0 when all reference cases pass

**Verification:**
```bash
pnpm --filter @baton/conformance test
pnpm -r build && node packages/conformance/dist/bin/baton-conformance.js --against packages/cli/dist/bin.js
```

**Commit:** `feat(conformance): runner + 5 synthetic reference cases + CLI command`

---

## Session 18 — Performance budgets in CI + `baton failover` end-to-end + cold-start optimization

**Tech spec:** §11 (performance budgets), §9.2 (npx cold start).

**Files to create:**
- `packages/cli/test/performance/cold-start.test.ts` — measures `baton --version` < 200ms
- `packages/cli/test/performance/failover.test.ts` — measures `baton failover` happy path < 5s
- `packages/compiler/test/performance/compile-fast.test.ts` — < 1s
- `packages/lint/test/performance/lint.test.ts` — < 200ms over typical packet
- `packages/render/test/performance/render.test.ts` — < 100ms
- `.github/workflows/ci.yml` — add `performance-budget` job

**Optimize:**
- Audit `packages/cli/src/bin.ts` — confirm no top-level imports beyond `commander` + own modules
- Audit every command for lazy-loading of heavy deps
- Use `node --import` lazy preloading where it saves ms

**Deliverables:**
- Every budget from tech spec §11 enforced in CI
- `failover` happy path verified end-to-end against fixture transcript

**Verification:**
```bash
pnpm test
gh run list --repo niketkal/baton --limit 1   # CI green incl performance-budget
```

**Commit:** `feat(ci,cli): performance budget tests for all commands`

---

## Session 19 — `baton migrate` skeleton + Homebrew formula + npm publish workflow

**Tech spec:** §6.4 (migrations), §9.3 (Homebrew), §9.1 (npm).

**Files to create:**
- `packages/cli/src/commands/migrate.ts` — runs schema migrations from `packages/schema/migrations/`
- `packages/schema/migrations/000-noop.ts` — exercises the migration path (no-op v1→v1)
- `packages/schema/src/migrate.ts` — `migrate(packetJson, fromVersion, toVersion) → packetJson`
- `packages/schema/test/migrate.test.ts`
- `homebrew/baton.rb` — Formula skeleton wrapping the npm release + pinned Node
- `homebrew/scripts/generate-formula.mjs` — release-time generator
- `.github/workflows/release.yml` — already exists from Session 1; verify OIDC trusted-publishing + provenance + SLSA attestation per github setup doc
- `.changeset/config.json` — already exists; verify `linked: [["@baton/*"]]`

**Deliverables:**
- `baton migrate --packet <id>` no-ops cleanly on a v1 packet
- Homebrew formula renders against a fixture v0.1.0 release
- `pnpm release --dry-run` produces a publishable artifact set

**Verification:**
```bash
pnpm --filter @baton/schema test
pnpm release --dry-run    # via changesets
```

**Commit:** `feat(migrate,homebrew,release): migration runner + brew formula + publish workflow`

---

## Session 20 — Docs polish: README, CONTRIBUTING, 4 contributor guides, ADRs 0001–0010

**Tech spec:** §14.2 (ADRs), §14.3 (contributor guides).

**Files to create/rewrite:**
- `README.md` — replace placeholder; hero pitch + 30-second quickstart + install + link to docs (no competitor names per CLAUDE.md invariant 5)
- `CONTRIBUTING.md` — replace placeholder; full contribution flow, ADR process, conformance discipline
- `docs/adr/0001-language-runtime.md` through `0010-schema-license-cc0.md` — one ADR per row in tech spec §14.2
- `docs/guides/adding-a-lint-rule.md` — < 500 words, working example, fixtures
- `docs/guides/adding-an-llm-provider.md`
- `docs/guides/adding-an-integration.md`
- `docs/guides/adding-a-renderer.md`
- `docs/guides/adding-a-conformance-case.md`
- `docs/architecture.md` — public-friendly version of tech spec §2 (strip competitive framing per github-setup doc)
- `docs/spec/cli-contract.md` — public-friendly version of `~/Projects/Ideas/baton/baton-cli-contract.md` (strip ICP / commercial framing)
- `docs/spec/lint-rules.md` — public-friendly version of `~/Projects/Ideas/baton/baton-lint-rules.md`
- `docs/spec/packet-schema.md` — human-readable wrapper around `packages/schema/packet.schema.json`

**Deliverables:**
- All public docs free of competitor names, monetization framing, viability/competitive language (run the github-setup pre-publish grep)
- ADRs technical only; no strategic framing
- Each contributor guide ≤ 500 words with a working example

**Verification:**
```bash
git grep -niE 'cli-continues|hydra|signet|passoff|handoff\.computer|mem0|letta|zep|spec-kit|kiro' && exit 1 || echo "no competitor names"
git grep -niE 'monetiz|pricing|paid tier|design partner|enterprise|cloud team|revenue' && exit 1 || echo "no commercial framing"
git grep -niE 'wedge|moat|defensibility|competitive|vendor encroachment' && exit 1 || echo "no strategic framing"
git grep -niE 'viability|verdict' docs/ && exit 1 || echo "no internal-review language"
```

**Commit:** `docs: README + CONTRIBUTING + 5 guides + 10 ADRs + public spec docs`

---

## Pre-flip-public checklist (after Session 20)

Per `~/Projects/Ideas/baton/baton-github-setup.md`:

- [ ] Add `SECURITY.md` + enable GitHub Private Vulnerability Reporting
- [ ] Add `.github/CODEOWNERS` with `@niketkal` on normative paths (`/packages/schema/`, `/packages/lint/`, `/docs/spec/`, `/docs/adr/`)
- [ ] Add `.github/ISSUE_TEMPLATE/bug_report.md` (asks for `baton --version` + `baton status --json`)
- [ ] Add `.github/PULL_REQUEST_TEMPLATE.md` (3 checkboxes: tests, perf budget, no secrets)
- [ ] Enable branch protection on `main`: require PR, 1 approval, status checks (`ci/lint`, `ci/test`, `ci/build`, `ci/conformance`, `ci/secrets-scan`, `ci/performance-budget`), require signed commits, linear history, no force push, no deletions
- [ ] Enable tag protection for `v*.*.*` pattern
- [ ] Register `@baton` org on npm (or pivot to a different scope if taken)
- [ ] Configure trusted publishing on each `@baton/*` package pointing at `niketkal/baton` + `release.yml`
- [ ] Verify Actions secrets surface is empty
- [ ] Run pre-flip greps (Session 20 verification) over the entire repo, not just `docs/`
- [ ] Run `gitleaks detect --source . --no-git=false` over full git history
- [ ] Polish `README.md` for v1.0 launch — replace "early development" with the real hero
- [ ] Flip: `gh repo edit niketkal/baton --visibility public --accept-visibility-change-consequences`
- [ ] Tag `v1.0.0`, push tag, OIDC publish runs, verify `npm install -g @baton/cli` works

---

## Out of scope for v1 (per tech spec §1.3, §17)

| Item | Where it goes |
|---|---|
| Baton Cloud | Phase-2; separate spec when activation gate met |
| MCP adapter | v1.5 — `@baton/adapters/mcp` |
| ACP adapter | v1.5 — `@baton/adapters/acp` |
| `github-comment` adapter | v1.5 alongside Cloud GitHub integration |
| Single binary (pkg/Node SEA) | Post-v1, demand-driven |
| TUI for `baton status` | v1.5 if discovery shows demand |
| Embeddings for context-item ranking | v2 |
| Long-term memory / knowledge graph | Out of scope |
| Live model routing / autonomous orchestration | Out of scope |
| GitHub App + webhook ingestion | v1.5 with Cloud (v1 ships example workflow only) |
| Outbound telemetry | Post-v1, opt-in only |

---

## Definition of done for v1 (tech spec §18)

- [ ] All commands in CLI contract implemented; `pnpm test` green
- [ ] Conformance suite passes 100% of reference cases
- [ ] "Beats hand-written" benchmark passes ≥ 70% across ≥ 10 scenarios
- [ ] All performance budgets in §11 enforced in CI
- [ ] BTN001–BTN060 implemented with fixtures
- [ ] `baton init` works for Claude Code on macOS + Linux; Codex CLI wrapper works on same
- [ ] `baton uninstall` reverses every install cleanly (round-trip test green)
- [ ] `npx @baton/cli failover` produces Codex-ready handoff in < 5s warm cache
- [ ] README, CONTRIBUTING, 4 contributor guides merged
- [ ] ADRs 0001–0010 merged
- [ ] Apache-2.0 / CC0 license split in place ✅ already done
- [ ] v1.0.0 published to npm
