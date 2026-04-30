# Adding a conformance case

The conformance suite is the public ecosystem asset that lets any
implementation claim Baton compatibility. New cases live as JSON files
under `packages/conformance/cases/`.

## 1. Pick a case category

Cases are grouped by what they test:

- `compile/` — artifact → packet behavior
- `lint/` — packet → BTN result
- `render/` — packet → target-specific output
- `repo/` — file/git verification behavior
- `freshness/` — stale-context behavior across commit changes
- `adapter/` — file and stdout adapter behavior

Pick the category that matches the contract you are testing. If your
case crosses categories, file it under the most specific one and add
cross-references in the case `description`.

## 2. Create the case file

Each case is a single JSON file:

```jsonc
// packages/conformance/cases/lint/btn012-missing-file.json
{
  "id": "lint/btn012-missing-file",
  "category": "lint",
  "description": "BTN012 fires when a context_item references a file that does not exist.",
  "input": {
    "packet": "fixtures/btn012-missing-file.packet.json",
    "repo": "fixtures/btn012-missing-file.repo/"
  },
  "expected": {
    "lint": {
      "status": "failed",
      "errors": [{ "code": "BTN012", "severity": "error" }]
    }
  }
}
```

Required fields: `id`, `category`, `description`, `input`, `expected`.
The exact shape per category is defined in
`packages/conformance/src/case-types.ts`.

## 3. Add fixtures

Place referenced fixtures next to the case under
`packages/conformance/cases/<category>/fixtures/`. Use synthetic,
anonymized content. **Never** include real customer or partner
transcripts in the public conformance suite — that is what the private
regression corpus is for.

Fixtures must be self-contained. A repo fixture is a directory with the
files the case references; the runner copies it to a temporary directory
before the test.

## 4. Run the suite locally

```bash
pnpm --filter @batonai/conformance test
```

The runner picks up every `*.json` under `cases/` automatically. If the
case fails, check:

- the `id` matches the file path under `cases/`
- referenced fixtures exist and are valid
- `expected` shape matches the category schema in `case-types.ts`

## 5. Document

If the case covers a behavior not yet listed in the conformance README,
add a one-line entry under the appropriate category. The README is a
human index over the case files; it is allowed to lag for a single PR
but should not stay out of sync.

## 6. PR

```
test(conformance): cover BTN012 missing-file path
```

Conformance cases do not need an ADR. They do need to pass on every
platform in the CI matrix (Node 20 + 22 × macOS + Linux + Windows). If
your case depends on a platform-specific path or shell behavior, mark
the case `platforms: ['linux', 'macos']` and the runner will skip it
elsewhere.

## 7. Third-party use

The same suite runs against external implementations:

```bash
npx @batonai/conformance --against ./my-bin
```

Cases you add automatically apply to anyone running the suite against
their own CLI. Keep that audience in mind: prefer behavior over
implementation, and prefer assertions that any conformant implementation
should satisfy.
