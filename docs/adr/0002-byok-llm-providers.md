# ADR 0002: LLM strategy — BYOK, multi-provider

- Status: Accepted
- Date: 2026-04-26

## Context

Baton uses an LLM for four narrow synthesis steps in `--full` compile
mode: objective extraction, attempt summarization, acceptance-criteria
drafting, and next-action recommendation. `--fast` mode does not call an
LLM; it reuses cached extractions plus deterministic refresh.

Three constraints shaped the decision:

1. **Multi-provider is non-negotiable.** Users come from at least three
   tool ecosystems (Claude Code, Codex, Cursor), and Baton's value is
   tool-agnostic handoff. Hard-wiring one provider would tilt the product.
2. **No hosted control plane in v1.** Baton is a local CLI. Users supply
   their own API key (BYOK) so we do not have to operate a billing or
   key-management service to ship.
3. **The compiler must not depend on a specific provider's SDK shape.**
   That keeps adding a new provider a one-file change and keeps the
   bundle small for users who only use one provider.

Alternatives considered:

- **Single-provider in v1, expand later.** Faster to ship, but it puts a
  thumb on the scale toward one tool ecosystem on day one. Rejected.
- **Hosted Baton-managed inference.** Would centralize key management,
  but contradicts the "no hosted control plane" v1 stance. Reserved for a
  potential future surface, not v1.
- **Local-only models.** Quality at the size class that fits a typical
  developer machine is not yet good enough for the four extraction tasks
  to clear the "beats hand-written" bar. Documented as a future provider
  contribution, not v1.

## Decision

Implement an LLM-provider abstraction in `@batonai/llm`:

```ts
interface LLMProvider {
  name: string;
  isConfigured(): boolean;
  complete(opts: CompleteOptions): Promise<CompleteResult>;
  estimateTokens(text: string): number;
}
```

Configuration order, first match wins:

1. Explicit flag (`--provider anthropic|openai|...`)
2. Config file (`.baton/config.toml` `[llm].provider`)
3. Environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …)
4. Fallback: `none` — `--fast` runs deterministic-only; `--full` errors
   with a helpful message

Ship with two providers in v1: Anthropic and OpenAI. Provider SDKs are
**optional peer dependencies** so users only install the SDK for the
provider they actually use.

The compiler imports the provider **registry**, never a specific provider
file.

## Consequences

Positive:

- Adding Google / Mistral / local models is one file plus a registry
  entry, suitable for community PRs.
- Users with no API key configured still get the `--fast` path, which
  covers `baton failover`.
- Bundle stays small; users do not pay for SDKs they don't use.
- Costs and token counts are reported per-call so users can audit spend.

Negative:

- Quality varies by provider. Mitigated by per-field confidence scores and
  the "explicit uncertainty over weakly supported guesses" principle in
  the CLI contract.
- Users have to manage their own API keys. We accept this as v1; a hosted
  surface remains a future option.
- Provider SDK churn (rate-limit shapes, response formats) becomes our
  problem at the registry level. Mitigated by mocked CI tests and a
  content-addressable completion cache that lets us replay fixtures.

## Related

- ADR 0001 (TypeScript on Node.js — provider SDKs are JS-native)
- The `@batonai/llm` package interface in `docs/architecture.md`
