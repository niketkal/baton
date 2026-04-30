# Adding a lint rule

A new BTN rule is one source file, one fixture pair, and one import line.

## 1. Create the rule file

Create `packages/lint/src/rules/BTN<NNN>-<name>.ts`. Pick the next free
BTN number above the existing range. Keep the file name kebab-case.

```ts
// packages/lint/src/rules/BTN061-packet-id-lowercase.ts
import type { LintRule } from '../types.js';

export const BTN061_packetIdLowercase: LintRule = {
  code: 'BTN061',
  severity: 'warning',
  failInStrict: true,
  description: 'Packet id must be lower-case kebab/snake/dot-separated.',
  check(packet) {
    if (packet.id !== packet.id.toLowerCase()) {
      return [
        {
          message: `Packet id "${packet.id}" must be lower-case.`,
          path: 'id',
        },
      ];
    }
    return [];
  },
};
```

A rule's `check()` returns a `LintRuleResult` — an array of zero or more
findings. Return `[]` to pass; return one or more `{ message, path?,
severity?, data? }` objects to fail. The engine fills in `code` from the
rule and applies the rule's default `severity` to any finding that
doesn't override it.

Rules are pure functions over `(packet, ctx)`. No filesystem or network
side effects. If you need repo state, use `ctx.fs` (read-only sandboxed)
or `ctx.repoRoot`.

## 2. Add fixtures

Create the directory `packages/lint/test/fixtures/BTN061-packet-id-lowercase/`
with two subdirectories:

```
BTN061-packet-id-lowercase/
├── good/
│   └── packet.json   # passes the rule
└── bad/
    └── packet.json   # fails the rule
```

Each `packet.json` is a complete, schema-valid packet. The fixture loader
in `packages/lint/test/` runs every rule against its `good` fixture
(must pass) and its `bad` fixture (must fail with the expected code).

Where the bad case has multiple variants (e.g. uppercase, mixed-case,
non-ASCII), use named subdirectories under `bad/`:

```
bad/
├── uppercase/packet.json
├── mixed-case/packet.json
└── unicode/packet.json
```

## 3. Register the rule

Edit `packages/lint/src/rules/index.ts` and add an explicit import plus
registration:

```ts
import { BTN061_packetIdLowercase } from './BTN061-packet-id-lowercase.js';

export const allRules = [
  // ...existing rules...
  BTN061_packetIdLowercase,
];
```

Explicit imports are deliberate: bundling stays predictable, tree-shaking
works, and the rule set is statically inspectable. No glob imports.

## 4. Document the rule

Add an entry to `docs/spec/lint-rules.md` describing severity, the rule
text, and whether it fails in strict mode. Match the format of existing
entries.

## 5. Run the tests

```bash
pnpm --filter @batonai/lint test
```

The fixture loader will pick up the new directory automatically. If the
test fails, check that:

- the rule file exports its rule under the same name imported by
  `index.ts`
- `code` matches the directory name prefix
- both `good` and `bad` fixtures validate against the packet schema
- the rule's `check()` returns a non-empty findings array on the bad
  fixture and `[]` on the good one

## 6. Open a PR

Schema- and lint-rule changes require an ADR if they are normative changes
(adding a rule that fires in strict mode counts). Otherwise a
conventional-commit PR is enough:

```
feat(lint): add BTN061 packet-id-lowercase
```

The CI gate runs the full BTN suite plus the conformance cases. Both
must pass.
