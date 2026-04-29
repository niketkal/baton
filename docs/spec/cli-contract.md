# Baton CLI Contract

Normative specification of the Baton command surface, output contract,
filesystem contract, and adapter contract. Implementations that claim Baton
compatibility must behave as described here.

---

## Purpose

`baton` is a CLI runtime that compiles agent context into structured packets
that can be rendered, dispatched, and re-ingested across any agentic tool.

Its highest-value job is preserving exact task state across:

- compaction
- fresh-session restarts
- agent caps, rate limits, or quota exhaustion
- tool switching
- agent rerouting

The contract is:

- CLI-first
- file-native
- scriptable
- tool-agnostic
- stable enough for agents to call directly

---

## Design principles

Baton works anywhere an agent can do one of these things:

- read a file
- write a file
- invoke a shell command
- consume JSON
- emit JSON

Baton does not require:

- a GUI
- a proprietary editor
- a hosted control plane
- MCP support (MCP is an adapter target, not the foundation)

---

## Distribution

For v1 launch, two install paths are first-class:

- **fastest first-use:** `npx @baton/cli failover ...`
- **stable daily-driver:** `npm install -g @baton/cli`
- **secondary stable (post-v1.0.0):** `brew install baton`

The Homebrew formula wraps a tagged npm release plus a pinned Node binary so
users without a Node install can run Baton as a single tool. The brew tap
submission is sequenced after the npm release stabilizes so the formula
always wraps a known-good tag.

See ADR [0007-distribution-npm-brew](../adr/0007-distribution-npm-brew.md).

---

## Command model

```
baton <command> [args] [flags]
```

### `baton init`

Create repo-local Baton state.

```bash
baton init
baton init --dry-run
baton init --yes
```

Effects:

- creates `.baton/` and `.baton/config.toml` plus default subdirectories
- auto-detects supported local harnesses and repo integrations
- installs supported hook entrypoints automatically (with confirmation
  unless `--yes`)
- enables conservative checkpointing defaults
- writes a setup report with fallback instructions where native hooks are
  unavailable

`baton init --dry-run` shows:

- which tools were detected
- which integration mode Baton would use for each tool
- which files or hooks would be modified
- which protections would remain unavailable without manual help

### `baton uninstall`

Reverse a Baton integration install.

```bash
baton uninstall <integration>
baton uninstall --all
baton uninstall <integration> --dry-run
```

Effects:

- reads `.baton/integrations/installed.json` to find what was installed and
  where
- restores any backed-up files to their pre-install content
- removes Baton-installed hooks, plugins, or wrapper launchers
- updates `.baton/integrations/installed.json` to drop the affected entry
- leaves `.baton/packets/`, `.baton/artifacts/`, and `.baton/history/`
  untouched

Exit `5` is returned if no install record is found for the named integration.

### `baton ingest`

Register an artifact with a packet or workspace.

```bash
baton ingest transcript claude.md --packet flaky-test-fix
baton ingest log failing-test.log --packet flaky-test-fix
baton ingest diff current.patch --packet flaky-test-fix
baton ingest issue issue.md --packet auth-bug
baton ingest transcript -                         # read from stdin
```

Supported kinds:

- `transcript`
- `log`
- `diff`
- `issue`
- `note`
- `image`
- `test-report`

### `baton compile`

Compile or refresh a packet from current artifacts.

```bash
baton compile --packet flaky-test-fix --repo .
baton compile --packet flaky-test-fix --repo . --fast
baton compile --packet flaky-test-fix --repo . --full
```

Effects:

- updates packet state
- refreshes provenance
- recalculates warnings and confidence

Mode guidance:

- `--fast` — default for hook-driven checkpoints; deterministic refresh and
  cached context, no live LLM call
- `--full` — explicit user-driven compile for the highest-quality handoff
  packet; runs the four LLM-backed extraction steps

Automatic checkpoints prefer `--fast`. Manual handoff preparation usually
prefers `--full`.

### `baton failover`

One-command handoff for the moment the user hits a wall.

```bash
baton failover --from claude-code --to codex --packet current-task
baton failover --from codex --to claude-code --packet auth-flake --copy
baton failover --from claude-code --to codex --packet current-task --out BATON.md
baton failover --from claude-code --to codex --packet current-task --full
```

Required v1 flags:

- `--from <tool>`
- `--to <tool>`
- `--packet <id>`

Optional v1 flags:

- `--copy`
- `--out <path>`
- `--full`

Default delivery:

- stdout if no output flag is set
- clipboard if `--copy` is set
- file write if `--out` is set

Default behavior:

1. detect or confirm source and target tools
2. gather latest artifacts from supported integrations plus repo state
3. refresh the packet with `compile --fast` (or `--full` if requested)
4. run non-strict lint and collect warnings
5. render the target-specific payload
6. deliver to stdout, clipboard, or file
7. return a structured result and leave canonical state in
   `.baton/packets/<id>/`

Failure behavior:

- **unknown target:** fail before compile with supported-target guidance
- **missing transcript or incomplete context:** emit partial packet plus
  explicit warnings, do not fake readiness
- **non-strict lint blocking issue:** stop only if the packet is not usable
  enough to hand off

`baton failover` has a 5-second warm-cache budget enforced in CI. The
`--fast` default is what makes that budget reachable.

### `baton lint`

Check whether a packet is safe and complete enough to dispatch.

```bash
baton lint flaky-test-fix
baton lint flaky-test-fix --json
baton lint flaky-test-fix --strict
```

The full BTN rule set is in [lint-rules.md](lint-rules.md). Strict mode
upgrades some warnings to blocking failures and requires provenance for
critical task claims.

### `baton render`

Render a packet for a target tool.

```bash
baton render flaky-test-fix --target codex
baton render flaky-test-fix --target claude-code --json
baton render flaky-test-fix --target generic > BATON.md
```

Targets in v1:

- `claude-code`
- `codex`
- `cursor`
- `generic`

### `baton dispatch` *(planned, v1.x)*

> Specified here as the normative interface; not yet present in the
> shipped CLI. Tracked against the v1.0 milestone.

Send a rendered payload through an adapter.

```bash
baton dispatch flaky-test-fix --target generic --adapter file
baton dispatch flaky-test-fix --target codex --adapter shell
```

Dispatch respects policy and approval settings (BTN042, BTN043, BTN050).

### `baton outcome ingest` *(planned, v1.x)*

> Specified here as the normative interface; not yet present in the
> shipped CLI. Tracked against the v1.0 milestone.

Ingest the result of a dispatched packet.

```bash
baton outcome ingest flaky-test-fix --source codex result.md
baton outcome ingest flaky-test-fix --source ci test-results.json
```

Effects:

- stores outcome
- updates packet state via the legal status transitions in BTN040
- may generate follow-up packet recommendations

### `baton status` *(planned, v1.x)*

> Specified here as the normative interface; not yet present in the
> shipped CLI. Tracked against the v1.0 milestone.

Show the current state of a packet.

```bash
baton status flaky-test-fix
baton status flaky-test-fix --json
```

Status output also surfaces:

- last checkpoint time
- active hook or wrapper integration mode
- last automatic checkpoint result

### `baton history` *(planned, v1.x)*

> Specified here as the normative interface; not yet present in the
> shipped CLI. Tracked against the v1.0 milestone.

Show packet versions, dispatches, and outcomes.

```bash
baton history flaky-test-fix
baton history flaky-test-fix --json
```

### `baton migrate`

Upgrade repo-local packet state to the current supported schema.

```bash
baton migrate --all
baton migrate --packet flaky-test-fix
```

Effects:

- migrates packet files to the latest supported schema version
- preserves prior snapshots in history
- reports any manual follow-up required

### `baton conformance` *(planned, v1.x)*

> Specified here as the normative interface; not yet present in the
> shipped CLI. Tracked against the v1.0 milestone.

Run the public conformance suite.

```bash
baton conformance
baton conformance --json
npx @baton/conformance --against ./my-bin   # third-party implementations
```

---

## Output contract

Every important command supports three output modes.

### Human mode (default)

Default terminal output for direct use.

### JSON mode

Machine-readable output for agents and scripts.

```bash
baton status flaky-test-fix --json
```

### File mode

Write rendered packets or exported artifacts to disk.

```bash
baton render flaky-test-fix --target generic --out BATON.md
```

---

## Filesystem contract

Repo-local state lives under `.baton/`:

```
.baton/
  config.toml
  packets/
    flaky-test-fix/
      packet.json
      packet.md
      warnings.json
      provenance.json
      exports/
      outcomes/
  artifacts/
  history/
  integrations/installed.json
  logs/
  state.db
```

Files are canonical; `state.db` is rebuildable. See ADR
[0003-state-storage](../adr/0003-state-storage.md).

### Human-readable artifact

The canonical shareable markdown file is `BATON.md`. It is readable by:

- humans
- coding agents
- CI steps
- GitHub comments or bots

### Structured artifact

`packet.json` is the stable interchange layer for automation. It validates
against the public packet schema (CC0).

---

## Generation and validation contract

Any tool or model may generate a candidate packet. The authoritative packet
is the one Baton has normalized and validated.

### Core rule

```
model output != trusted Baton packet
```

The trusted packet is produced only after Baton runs:

1. schema validation
2. normalization
3. deterministic verification
4. policy checks

### Validation levels

- `draft` — candidate exists but has not been validated
- `valid` — schema passes and required fields exist
- `verified` — file refs, git refs, and provenance-critical checks passed
- `ready` — policy checks passed; packet may be rendered or dispatched

### Deterministic checks

Without a model where possible, Baton verifies:

- packet schema version is supported
- required fields are present
- referenced files exist
- referenced directories exist
- referenced commits or branches resolve
- stale-context checks pass
- token budget can be estimated
- packet status transition is legal

### Provenance

Important claims must link back to source artifacts. At minimum, Baton
requires provenance for:

- relevant files
- claimed failed attempts
- hard constraints
- acceptance criteria copied from user or ticket context

Important synthesized fields also carry field-level confidence where
practical. The runtime prefers explicit uncertainty, open questions, and
missing-data warnings over confident but weakly supported guesses.

### Strict mode

`baton lint --strict` fails when a packet is not safe enough for downstream
use. See [lint-rules.md](lint-rules.md) for the full rule set.

### The certification principle

> Any model can draft Baton. Only Baton can certify Baton.

---

## Exit codes

- `0` — success
- `1` — runtime failure
- `2` — lint failed or packet incomplete
- `3` — approval required before dispatch
- `4` — adapter failure
- `5` — packet not found or invalid packet state

This makes Baton easy to use inside scripts, git hooks, CI pipelines, and
other agent runtimes.

---

## Adapter contract

Adapters move a rendered packet to its destination without coupling the core
runtime to one vendor.

Each adapter implements:

- `prepare(packet, target, options) -> payload`
- `deliver(payload) -> receipt`
- `poll(receipt) -> status`
- `ingest(result) -> outcome`

### Adapters in v1

- `file` — writes `BATON.md` or structured output to disk
- `stdout` — prints payload to stdout
- `shell` — invokes a configured shell command with payload input
- `clipboard` — copies the rendered handoff to the system clipboard, used by
  `baton failover --copy`

### Adapters in v1.5+

- `github-comment`
- `mcp-claude`
- `mcp-codex`
- `acp`

---

## Config contract

The default config file is `.baton/config.toml`. It supports at least:

- default repo path
- preferred target order
- adapter settings
- approval mode
- warning thresholds
- stale-context policy
- checkpointing policy
- integration and hook state
- artifact redaction policy

Example:

```toml
default_target = "codex"
approval_mode = "assisted"
stale_context_commits = 1

[adapters.file]
enabled = true

[adapters.shell]
enabled = false
command = ""

[checkpointing]
enabled = true
interval_minutes = 10
on_pre_compaction = true
on_session_end = true
on_limit_warning = true
on_explicit_handoff = true
on_material_repo_change = true

[sync]
redact_on_sync = true
block_on_secret_warning = true
```

---

## Automatic setup

Running `baton init` attempts to:

- detect supported local harnesses and repo integrations
- install native hook entrypoints where the tool allows it
- fall back to wrapper launchers where native hooks are unavailable
- enable periodic checkpointing with conservative defaults
- verify that at least one checkpoint path works
- record the chosen integration mode in `.baton/config.toml`

### v1 integration matrix

| Tool / surface | Primary v1 mode | Fallback mode | Notes |
|---|---|---|---|
| Claude Code | native hook | wrapper launcher | best checkpoint coverage target |
| Codex CLI | wrapper launcher | manual/paste fallback | important first-class failover target |
| Cursor | wrapper launcher | pasted artifacts | IDE transcript access may be weaker |
| Generic CLI tool | manual/paste fallback | periodic checkpoint timer | lowest-common-denominator path |
| GitHub / CI | webhook ingestion (v1.5) | manual import | repo-event initiated |

Supported automatic checkpoint moments:

- pre-compaction
- session-end or before-exit
- limit-warning or budget-warning
- explicit handoff
- debounced material repo-state changes

Fallback ladder, in order:

1. native hook
2. wrapper launcher
3. periodic checkpoint timer
4. manual-only fallback

See ADR [0008-tool-integration-modes](../adr/0008-tool-integration-modes.md).

---

## Automation patterns

### Compaction, restart, limit pattern

Once `baton init` has installed hooks or wrappers, these checkpoints happen
automatically. The commands below are the manual fallback.

Before compaction, session exit, or an expected limit boundary:

```bash
baton compile --packet current-task --repo .
baton render current-task --target generic --out BATON.md
```

After compaction, in a new session, or when failing over to another agent:

```bash
baton status current-task
baton render current-task --target codex
```

### Conformance testing

Baton ships a public conformance suite. Other tools can claim
Baton-compatibility against shared tests. See ADR
[0009-conformance-as-public-asset](../adr/0009-conformance-as-public-asset.md).

### Metrics and token-savings

Baton exposes transfer-efficiency metrics, presented honestly:

- `raw_context_token_estimate`
- `rendered_packet_token_estimate`
- `estimated_tokens_avoided` = raw − rendered
- `context_reduction_percent` = avoided / raw

Optional cost estimation maps the token delta against configured per-token
input rates with a min/max range and a confidence label (`high`, `medium`,
`low`). Baton does not claim exact total money saved.

Examples:

- `42,300 raw tokens → 3,900 Baton tokens`
- `90.8% context reduction`
- `Estimated input cost avoided: $0.34 to $0.61`

---

## Non-goals for v1

Baton does not require:

- hosted auth
- a database server
- an IDE plugin
- a graphical dashboard
- a proprietary packet format

The first win is `baton` becoming the portable context-and-dispatch layer
that any developer can slot into an existing workflow.
