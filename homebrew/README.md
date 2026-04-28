# Baton Homebrew formula

This directory holds the Homebrew formula for Baton and the release-time
generator that fills in the npm tarball URL and sha256.

## Files

- `baton.rb` — formula source. Committed with `VERSION` /
  `GENERATED_AT_RELEASE` placeholders so reviewers can see the shape; the
  generator rewrites these in place at release time.
- `scripts/generate-formula.mjs` — reads `packages/cli/package.json`, fetches
  the published npm tarball, computes its sha256, and rewrites `baton.rb`.

## Release-time flow

The release pipeline (`.github/workflows/release.yml`) runs:

1. `pnpm changeset publish --provenance` — publishes `@baton/cli` to npm with
   OIDC trusted publishing + provenance attestation.
2. `node homebrew/scripts/generate-formula.mjs` — resolves the formula against
   the just-published tarball.
3. (Future) Submit `homebrew/baton.rb` to a Baton-owned tap. Per the
   github-setup doc, the tap submission is held until npm v1.0.0 stabilizes —
   we don't want a Homebrew install to point at a pre-1.0 surface.

## Local smoke check

```bash
node homebrew/scripts/generate-formula.mjs --dry-run
```

`--dry-run` skips the network fetch (so it works offline / in CI smoke tests)
and prints the rewritten formula to stdout instead of mutating `baton.rb`.
