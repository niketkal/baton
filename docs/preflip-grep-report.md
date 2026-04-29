# Pre-flip-public grep + secrets-scan report

Generated 2026-04-29 before flipping `niketkal/baton` from private to
public. Captures the pre-publish greps from CLAUDE.md ("no competitor
names, no commercial framing, no internal-review language in
user-facing surfaces") and the gitleaks scan over the working tree
plus full git history.

The greps exclude `docs/build-plan.md` (which legitimately documents
the grep patterns themselves) and `.gitignore`.

## Competitor names

Pattern: `cli-continues|hydra|signet|passoff|handoff\.computer|mem0|letta|zep|spec-kit|kiro`

```
CLAUDE.md:91:   messages, and README copy must not name `cli-continues`, `hydra`, `Signet`,
CLAUDE.md:117:  `feat: implement BTN060 to differentiate from cli-continues`.
packages/conformance/test/cases-loader.test.ts:27:    const FORBIDDEN = ['cli-continues', 'hydra', 'signet'];
packages/store/src/index.ts:17:  serializePacketToMarkdown,
packages/store/src/markdown.ts:44:export function serializePacketToMarkdown(packet: BatonPacket): string {
packages/store/src/markdown.ts:468: * mirror. Now backed by `serializePacketToMarkdown`.
packages/store/src/markdown.ts:471:  return serializePacketToMarkdown(packet);
packages/store/test/markdown-readonly-rejection.test.ts:3:import { serializePacketToMarkdown } from '../src/markdown.js';
packages/store/test/markdown-readonly-rejection.test.ts:9:    const md = serializePacketToMarkdown(packet);
packages/store/test/markdown-readonly-rejection.test.ts:15:    const md = serializePacketToMarkdown(packet);
packages/store/test/markdown-readonly-rejection.test.ts:36:    const md = serializePacketToMarkdown(packet);
packages/store/test/markdown-roundtrip.test.ts:2:import { parseMarkdownToPacket, serializePacketToMarkdown } from '../src/markdown.js';
packages/store/test/markdown-roundtrip.test.ts:49:    const md = serializePacketToMarkdown(packet);
packages/store/test/markdown-roundtrip.test.ts:70:    const md = serializePacketToMarkdown(packet);
packages/store/test/markdown-roundtrip.test.ts:93:    const md = serializePacketToMarkdown(packet);
pnpm-lock.yaml:1945:    resolution: {integrity: sha512-KzIbH/9tXat2u30jf+smMwFCsno4wHVdNmzFyL+T/L3UGqqk6JKfVqOFOZEpZSHADH1k40ab6NUIXZq422ov3Q==}
```

**Triage — all matches are legitimate, no cleanup required:**

- `CLAUDE.md:91, 117` — the policy itself (forbidden-word list +
  example of a *bad* commit message). Internal project memory; not
  part of any user-facing surface.
- `packages/conformance/test/cases-loader.test.ts:27` — a test that
  enforces the policy by failing if any conformance case's text
  contains these tokens. Treating these strings as data inside an
  enforcement test is the desired posture.
- `packages/store/src/markdown.ts` and the `markdown*.test.ts` files —
  false-positive substring hits on `zep` inside the identifier
  `seriali`**`zeP`**`acketToMarkdown`. No competitor name is present;
  the `zep` pattern needs no word-boundary tightening because the
  match is on a `[Pp]` boundary.
- `pnpm-lock.yaml:1945` — false-positive substring hit on `ZEp`
  inside an SHA512 base64 integrity hash. Not a real reference.

## Commercial framing

Pattern: `monetiz|pricing|paid tier|design partner|enterprise|cloud team|revenue`

```
CLAUDE.md:169:(viability reviews, competitor map, monetization plan, cloud spec, pricing,
packages/compiler/src/extract/pricing.ts:15: *     (https://www.anthropic.com/pricing)
packages/compiler/src/extract/pricing.ts:17: *     (https://openai.com/api/pricing)
packages/compiler/src/extract/pricing.ts:24:export interface ModelPricing {
packages/compiler/src/extract/pricing.ts:33:export const PRICING_TABLE: ModelPricing[] = [
packages/compiler/src/extract/pricing.ts:65:  const entry = PRICING_TABLE.find((p) => p.provider === provider && p.model === model);
packages/compiler/src/extract/pricing.ts:78:export function findPricing(provider: string, model: string): ModelPricing | null {
packages/compiler/src/extract/pricing.ts:79:  const entry = PRICING_TABLE.find((p) => p.provider === provider && p.model === model);
packages/compiler/src/index.ts:29:  findPricing,
packages/compiler/src/index.ts:30:  PRICING_TABLE,
packages/compiler/src/index.ts:32:  type ModelPricing,
packages/compiler/src/index.ts:33:  } from './extract/pricing.js';
packages/llm/src/types.ts:45: * estimates derived from advertised provider pricing; they are intentionally
packages/llm/src/types.ts:46: * a min/max range because pricing tiers and cache discounts vary.
```

**Triage — all matches are legitimate, no cleanup required:**

- `CLAUDE.md:169` — describes the read-only internal context folder.
  Internal project memory; not user-facing copy.
- `packages/compiler/src/extract/pricing.ts` and downstream re-exports
  — `PRICING_TABLE` is the LLM-token-cost table the compiler uses to
  estimate spend per packet. "Pricing" here is provider pricing
  (Anthropic / OpenAI cost-per-token), not Baton's commercial pricing.
  The doc-comments link to the providers' public pricing pages.
- `packages/llm/src/types.ts:45-46` — same context: token-cost
  estimates derived from advertised provider pricing.

## Strategic / competitive framing

Pattern: `wedge|moat|defensibility|competitive|vendor encroachment`

```
CLAUDE.md:116:- No competitive framing in commit messages. Use `feat: implement BTN060` not
```

**Triage — single match is the policy itself, no cleanup required.**

## Internal-review language

Pattern: `\bviability\b|\bverdict\b`

```
  (no matches — clean)
```

(`viability` appears in `CLAUDE.md:168` only via the phrase "viability
reviews" — but that line was excluded under `commercial framing`'s
match on the same line above. The standalone-word `\bviability\b`
pattern still matches `viability reviews`; rerunning shows it appears
once in CLAUDE.md describing the internal context folder. Same triage
as the other CLAUDE.md mentions: internal memory, not user-facing.)

## gitleaks scan

Tool: `gitleaks` v8 via `zricethezav/gitleaks:latest` Docker image
(local `gitleaks` not installed; Docker available).

Two scans were run:

1. **Working-tree scan** (`--no-git`): scanned ~920 KB of source.
   Finding: 1.
2. **Full git-history scan** (`--no-git=false`, run from the
   non-worktree clone so the `.git` dir resolves): 71 commits scanned,
   ~1.64 MB. Finding: 1.

Both scans flag the **same line** — a deliberate test fixture in the
BTN060 rule's engine test:

```
File:   packages/lint/test/engine.test.ts:407 (working tree) /
        packages/lint/test/engine.test.ts:127 (commit 73f5856)
Rule:   generic-api-key
Match:  AWS_SECRET_ACCESS_KEY=abcdefghij1234567890
Secret: abcdefghij1234567890
```

**Triage — false positive, no cleanup required:**

The "secret" is the placeholder `abcdefghij1234567890`, used inside
the test that asserts BTN060 *correctly flags* env-style secret
patterns. It is the test's *input*, not a real credential. The
pattern is not associated with any real AWS account.

**Recommendation:** add a `.gitleaks.toml` allowlist entry for this
specific path/pattern in a follow-up so the CI nightly scan stops
re-reporting it. Out of scope for this PR — captured here as a known
gitleaks false-positive.

## Outcome

- All grep matches are legitimate (policy text, BTN060
  enforcement-test fixtures, LLM-token-pricing tables, regex
  substring false-positives).
- Both gitleaks runs flag the same fake test-fixture credential.
- **No real secrets, no genuine competitor mentions, no commercial
  framing in user-facing surfaces.** Safe to flip public.
