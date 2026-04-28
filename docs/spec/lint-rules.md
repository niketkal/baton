# Baton Lint Rules

Normative lint and certification rules for Baton packets.

---

## Purpose

`baton lint` is the boundary between:

- model-drafted packets
- trusted Baton packets

Its job is not to make the packet pretty. Its job is to determine whether
the packet is safe enough to rely on for render, dispatch, restart, or
reroute.

---

## Modes

### Default mode

`baton lint`

Use for:

- interactive authoring
- packet review
- warning generation

Behavior:

- reports warnings and errors
- allows non-blocking issues to remain
- exits `2` only when the packet is unsafe or incomplete

### Strict mode

`baton lint --strict`

Use for:

- dispatch gating
- CI
- automation
- fresh-session resume checks

Behavior:

- upgrades some warnings into blocking failures
- requires provenance for critical task claims
- requires repo and freshness checks for code tasks
- exits `2` on any rule marked `Fail in strict mode`

---

## Certification flow

A packet moves through these certification levels:

1. `draft`
2. `valid`
3. `verified`
4. `ready`

### `draft`

The packet exists but has not passed validation.

### `valid`

The packet matches `packages/schema/packet.schema.json` and required fields
are present.

### `verified`

Baton checked key deterministic claims against local reality:

- files
- directories
- git refs
- stale context
- provenance-critical references

### `ready`

The packet passed policy checks and is safe to render or dispatch.

---

## Rule levels

- `info` — advisory only
- `warning` — something is missing or weak, but the packet may still be
  usable
- `error` — packet is not safe to trust or dispatch
- `critical` — packet is invalid, contradictory, or dangerously stale

---

## Rule set

### BTN001 `schema_version_supported`

Severity: `critical`

Rule: `schema_version` must equal `baton.packet/v1`.

Fail in strict mode: always.

### BTN002 `packet_schema_valid`

Severity: `critical`

Rule: packet must validate against `packages/schema/packet.schema.json`.

Fail in strict mode: always.

### BTN003 `required_narrative_fields_present`

Severity: `error`

Rule: `objective`, `current_state`, and `next_action` must be non-empty.

Fail in strict mode: always.

### BTN004 `confidence_score_bounded`

Severity: `error`

Rule: `confidence_score` must be between `0` and `1`.

Fail in strict mode: always.

### BTN010 `repo_context_required_for_code_tasks`

Severity: `error`

Rule: if `task_type` is `implementation`, `debugging`, or `review`,
`repo_context.attached` must be `true`.

Fail in strict mode: always.

### BTN011 `context_items_required_for_code_tasks`

Severity: `error`

Rule: if `task_type` is `implementation`, `debugging`, or `review`,
`context_items` must contain at least one item with `kind = file`, `test`,
`diff`, `log`, or `issue`.

Fail in strict mode: always.

### BTN012 `referenced_files_exist`

Severity: `error`

Rule: every `context_item.ref` with `kind = file` or `directory` must exist
locally when `repo_context.attached = true`.

Fail in strict mode: always.

### BTN013 `git_refs_resolve`

Severity: `error`

Rule: `repo_context.branch`, `repo_context.commit`, and
`repo_context.base_commit` must resolve when present.

Fail in strict mode: always.

### BTN014 `packet_not_stale`

Severity: `critical`

Rule: if the repo head moved beyond configured stale thresholds after
packet compilation, the packet is stale.

Recommended v1 behavior:

- if files referenced by the packet changed after compilation, fail
- if the head moved but no referenced files changed, warn and allow
  explicit refresh
- prefer conservative detection over pretending freshness

Fail in strict mode: always.

### BTN020 `acceptance_criteria_required_for_execution`

Severity: `error`

Rule: if `task_type` is `implementation`, `debugging`, or `review`,
`acceptance_criteria` must contain at least one required item.

Fail in strict mode: always.

### BTN021 `open_blocking_questions_gate_readiness`

Severity: `error`

Rule: a packet with any `open_questions` where `blocking = true` and
`status = open` cannot be `ready`.

Fail in strict mode: always.

### BTN030 `constraints_require_provenance`

Severity: `error`

Rule: every constraint must include at least one provenance reference.

Fail in strict mode: always.

### BTN031 `attempt_failures_require_evidence`

Severity: `warning`

Rule: any attempt with `result = failed` should reference at least one
supporting artifact.

Fail in strict mode: yes.

### BTN032 `acceptance_criteria_require_provenance`

Severity: `warning`

Rule: acceptance criteria sourced from `user` or `ticket` should include
provenance references.

Fail in strict mode: yes.

### BTN033 `context_items_require_provenance`

Severity: `warning`

Rule: high-priority context items with `priority >= 4` should point to at
least one provenance link.

Fail in strict mode: yes.

### BTN040 `status_transition_legal`

Severity: `error`

Rule: packet status may change only through legal transitions.

Allowed transitions:

- `draft` → `ready_for_export`, `needs_clarification`, `abandoned`
- `ready_for_export` → `awaiting_approval`, `dispatched`,
  `needs_clarification`, `abandoned`
- `awaiting_approval` → `ready_for_export`, `dispatched`, `abandoned`
- `dispatched` → `awaiting_outcome`, `needs_clarification`, `abandoned`
- `awaiting_outcome` → `completed`, `ready_for_export`,
  `needs_clarification`, `abandoned`
- `needs_clarification` → `draft`, `ready_for_export`, `abandoned`
- `completed` → no transitions
- `abandoned` → no transitions

Fail in strict mode: always.

### BTN041 `ready_requires_validation_level_ready`

Severity: `error`

Rule: packet `status = ready_for_export` or `dispatched` requires
`validation_level = ready`.

Fail in strict mode: always.

### BTN042 `approval_policy_respected`

Severity: `error`

Rule: if `policy.approval_required = true`, packet cannot dispatch until
approval is granted.

Fail in strict mode: always.

### BTN043 `dispatch_allowed_policy_respected`

Severity: `error`

Rule: if `policy.dispatch_allowed = false`, packet cannot dispatch.

Fail in strict mode: always.

### BTN050 `blocking_warnings_gate_dispatch`

Severity: `error`

Rule: any warning with `blocking = true` prevents the packet from becoming
`ready`.

Fail in strict mode: always.

### BTN060 `no_apparent_secrets_in_artifacts`

Severity: `critical`

Rule: artifacts prepared for dispatch or sync must not appear to contain
obvious secrets, tokens, private keys, credentials, or similar sensitive
values unless explicitly redacted.

Recommended checks:

- known secret prefixes and token formats
- PEM private key markers
- `.env`-style credential assignments in included excerpts
- high-entropy strings in obviously sensitive contexts

Behavior:

- local lint blocks dispatch in strict mode
- sync blocks by default when redaction policy is enabled

Fail in strict mode: always.

---

## Lint output

`baton lint --json` returns a report shaped like:

```json
{
  "packet_id": "flaky-test-fix",
  "status": "failed",
  "validation_level": "verified",
  "errors": [
    {
      "code": "BTN014",
      "severity": "critical",
      "message": "Packet is stale against current HEAD."
    }
  ],
  "warnings": [],
  "summary": {
    "blocking_count": 1,
    "warning_count": 0
  }
}
```

Allowed report statuses:

- `passed`
- `failed`
- `needs_clarification`

---

## Exit codes

- `0` — lint passed
- `2` — lint failed or packet incomplete
- `3` — approval required before dispatch

Runtime failures still use the general Baton exit code `1`.

---

## Practical rule

The simplest way to think about Baton lint:

- models can propose
- Baton can certify
- automation only trusts certified packets
