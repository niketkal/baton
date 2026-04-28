# ADR 0007: Distribution — npm primary, brew secondary, npx for trial

- Status: Accepted
- Date: 2026-04-26

## Context

Baton's most valuable moment is `baton failover`: a developer hit a wall
in one tool and needs to continue in another **right now**. The
distribution shape has to optimize for both:

- **first-time trial in seconds** (no global install, no config to
  edit)
- **stable daily-driver install** (one install, runs anywhere in the
  user's repos)

The user audience is JS-comfortable developers using AI coding tools.
That biases distribution toward the channels they already use.

Options weighed:

- **npm only.** Simple, fast to ship, requires a Node install for users.
  Works for the developer audience but excludes Mac-heavy users without a
  Node install.
- **Single static binary (Go-style).** Best install UX for non-developer
  users; would force the language choice (see ADR 0001) or a single-binary
  packaging step over the Node CLI (Node SEA, `pkg`). Single-binary
  packaging over Node is feasible but not battle-tested enough at v1
  scale.
- **Homebrew only.** Strong Mac UX, but Mac-only and slower to iterate
  versions.

The pragmatic v1 shape is "ship the npm path first, add a Homebrew
formula that wraps a tagged npm release with a pinned Node binary so
users without Node installed get a single-tool experience."

## Decision

Three install paths, in priority order:

1. **`npx @baton/cli failover ...`** — fastest first-use trial. Cold-
   start budget < 5s on a cold npm cache, enforced in CI.
2. **`npm install -g @baton/cli`** — stable daily-driver install. Ships
   with v1.0.0.
3. **`brew install baton`** — secondary stable install for users without
   a Node install. Ships **shortly after v1.0.0** stabilizes; the formula
   wraps a tagged npm release plus a pinned Node binary so the brew
   install always points at a known-good npm tag. Submission to a
   Baton-owned tap first; submission to homebrew-core deferred until
   install volume justifies it.

Single-binary distribution via Node SEA or `pkg` is **deferred** to
post-v1. The npm and brew paths cover the user audience for the OSS
launch.

`@baton/cli` is the published package. Its bin entry is `baton`. LLM
provider SDKs are optional peer dependencies so users only install the
SDK for the provider they actually use.

## Consequences

Positive:

- The two install commands are the two users will already type.
- `npx` matches the moment-of-pain failover use case.
- Homebrew wrapping a tagged npm release means the brew formula always
  points at a stable tag; no separate stability story.
- Releases use OIDC trusted publishing to npm with `--provenance`. No
  long-lived `NPM_TOKEN` lives in the repo.

Negative:

- A Node install is required for npm/npx users; addressed by the brew
  path.
- The Homebrew formula is generated and submitted **after** the
  corresponding npm release stabilizes, which means brew users lag npm
  users by days for fast-moving releases. Acceptable for the audience.
- Single-binary users have to wait for a future post-v1 distribution
  decision. Tracked as future work.

## Related

- ADR 0001 (TypeScript on Node.js — implies npm/npx as the natural
  primary channel)
- ADR 0004 (monorepo with pnpm workspaces — cleanly maps to per-package
  npm publish)
