# Baton Packet Schema

A human-readable wrapper around `packages/schema/packet.schema.json`.

The JSON Schema is the **normative** definition; this document describes
each top-level field with type, meaning, and example values. The schema is
licensed under [CC0 1.0](../../LICENSE-SCHEMA) so any tool may read or
write Baton packets without legal friction.

- Schema ID: `https://baton.dev/schema/packet-v1.json`
- Schema version constant: `baton.packet/v1`
- Spec: JSON Schema 2020-12

---

## Top-level shape

```json
{
  "schema_version": "baton.packet/v1",
  "id": "flaky-test-fix",
  "title": "Fix flaky login test",
  "status": "ready_for_export",
  "validation_level": "ready",
  "task_type": "debugging",
  "objective": "...",
  "current_state": "...",
  "next_action": "...",
  "open_questions": [],
  "confidence_score": 0.86,
  "repo_context": { "...": "..." },
  "context_items": [ ],
  "constraints": [ ],
  "attempts": [ ],
  "acceptance_criteria": [ ],
  "warnings": [ ],
  "provenance_links": [ ],
  "source_artifacts": [ ],
  "policy": { "...": "..." },
  "render_hints": { "...": "..." },
  "extensions": { },
  "created_at": "2026-04-26T10:00:00Z",
  "updated_at": "2026-04-26T10:05:00Z"
}
```

`additionalProperties` is `false` at the top level. Anything experimental
goes under `extensions`.

---

## Required fields

### `schema_version`

- Type: `string`
- Const: `"baton.packet/v1"`

Identifies the schema version. Readers must support the current version
plus the immediately previous version. `baton migrate` upgrades older
packets in place after writing the prior version to history.

### `id`

- Type: `string`
- Pattern: `^[a-z0-9][a-z0-9._-]{1,127}$`

Stable, repo-local identifier. Used as the directory name under
`.baton/packets/<id>/`. Lower-case, dotted/hyphenated/underscored, 2–128
characters.

Example: `flaky-test-fix`, `auth-bug.2026-04-26`.

### `title`

- Type: `string`
- Length: 3–200

Short human-readable label. Shown in `baton status` and renderer output.

### `status`

- Type: enum
- Values: `draft` | `ready_for_export` | `awaiting_approval` |
  `dispatched` | `awaiting_outcome` | `needs_clarification` | `completed` |
  `abandoned`

Workflow state. Legal transitions are defined by BTN040 in
[lint-rules.md](lint-rules.md).

### `validation_level`

- Type: enum
- Values: `draft` | `valid` | `verified` | `ready`

How far the packet has progressed through Baton certification. See the
certification flow in [lint-rules.md](lint-rules.md).

### `task_type`

- Type: enum
- Values: `implementation` | `debugging` | `review` | `docs` | `analysis` |
  `generic`

Drives task-specific lint rules (BTN010, BTN011, BTN020).

### `objective`

- Type: `string`
- Length: 1–4000

What the user is trying to accomplish. Must be non-empty (BTN003).

### `current_state`

- Type: `string`
- Length: 1–8000

Where the work currently stands. Captures progress, intermediate findings,
known blockers.

### `next_action`

- Type: `string`
- Length: 1–4000

What the receiving tool should do next.

### `open_questions`

- Type: array of `openQuestion`

```json
{
  "id": "needs-prod-creds",
  "text": "Do we have read access to the prod logs bucket?",
  "blocking": true,
  "status": "open"
}
```

A blocking open question (`blocking: true`, `status: "open"`) prevents the
packet from being `ready` (BTN021).

### `confidence_score`

- Type: `number`
- Range: 0–1

Aggregate confidence in the packet's synthesized fields. Bounded by BTN004.

### `repo_context`

- Type: `repoContext` object

```json
{
  "attached": true,
  "root": ".",
  "vcs": "git",
  "branch": "fix/login-flake",
  "base_branch": "main",
  "commit": "abc1234",
  "base_commit": "def5678",
  "dirty": true
}
```

When `attached: true`, `vcs` must be `git` and `root` must be a non-empty
string. Code task types require `attached: true` (BTN010). Git refs must
resolve (BTN013).

### `context_items`

- Type: array of `contextItem`

Each item:

```json
{
  "kind": "file",
  "ref": "tests/login.spec.ts",
  "reason": "Failing Playwright test referenced in CI log.",
  "priority": 5,
  "freshness_score": 1,
  "exists": true,
  "provenance_refs": ["prov-1"]
}
```

`kind` is one of `file` | `directory` | `command` | `doc` | `test` |
`symbol` | `diff` | `log` | `issue`. `priority` is 1–5; `freshness_score`
is 0–1.

### `constraints`

- Type: array of `constraint`

Each constraint:

```json
{
  "id": "keep-assertions",
  "type": "technical",
  "text": "Do not weaken assertions or increase retries as the primary fix.",
  "severity": "error",
  "source": "user",
  "provenance_refs": ["prov-2"]
}
```

Every constraint must include at least one provenance reference (BTN030).

### `attempts`

- Type: array of `attempt`

Records of prior tries, with `result` (e.g. `succeeded`, `failed`,
`partial`), failure reason, and an evidence span. Failed attempts should
reference at least one supporting artifact (BTN031).

### `acceptance_criteria`

- Type: array of `acceptanceCriterion`

Each criterion:

```json
{
  "id": "stable-login-test",
  "text": "The login test passes locally and in CI without weakening assertions.",
  "status": "unmet",
  "required": true,
  "source": "user",
  "provenance_refs": ["prov-2"]
}
```

`status` is `unmet` | `partial` | `met`. Code task types require at least
one required item (BTN020). User- or ticket-sourced criteria should carry
provenance (BTN032).

### `warnings`

- Type: array of `warning`

Lint output captured on the packet. Any warning with `blocking: true`
prevents the packet from becoming `ready` (BTN050).

### `provenance_links`

- Type: array of `provenanceLink`

Each link:

```json
{
  "id": "prov-1",
  "field_name": "context_items[0]",
  "artifact_id": "ci-log",
  "source_type": "log",
  "ref": "failing-test.log",
  "span_start": 0,
  "span_end": 120,
  "excerpt": "Timeout waiting for login button to become enabled."
}
```

Span-level links from packet fields back to source artifacts. Drives the
"any tool can audit" property of the packet.

### `source_artifacts`

- Type: array of `sourceArtifact`

Each artifact:

```json
{
  "id": "claude-session",
  "type": "transcript",
  "source_tool": "claude-code",
  "uri": "claude-session.md",
  "digest": "sha256:11111111",
  "created_at": "2026-04-26T09:45:00Z"
}
```

`type` is one of `transcript` | `issue` | `diff` | `log` | `note` |
`image` | `test-report`.

### `created_at`, `updated_at`

- Type: `string` (RFC 3339 / ISO 8601 date-time)

---

## Optional fields

### `policy`

Per-packet policy overrides:

- `approval_required: boolean`
- `dispatch_allowed: boolean`
- approval / dispatch rules per BTN042 and BTN043

### `render_hints`

Hints for renderers (preferred ordering, length budgets, target overrides).
Renderers may ignore unknown hints.

### `extensions`

Reserved extension surface. `additionalProperties: true`. Implementations
may store non-normative metadata here. The lint engine and conformance
suite ignore this field.

---

## Derived metrics

The CLI may emit these alongside a packet. They are not part of the
packet's required schema but are documented for consistency:

- `raw_context_token_estimate`
- `rendered_packet_token_estimate`
- `estimated_tokens_avoided`
- `context_reduction_percent`
- `estimated_input_cost_avoided_min`
- `estimated_input_cost_avoided_max`
- `estimation_confidence` (`high` | `medium` | `low`)

---

## Schema governance

- Code is Apache-2.0; the schema and normative examples are CC0.
- Readers must support the current schema plus the immediately previous
  schema revision.
- Newer writers do not silently mutate old packets in place. `baton
  migrate` is the explicit upgrade path.
- Migrations preserve immutable prior snapshots under
  `.baton/history/packets/<id>/`.

See ADR [0010-schema-license-cc0](../adr/0010-schema-license-cc0.md).
