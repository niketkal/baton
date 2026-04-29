# Adding an LLM provider

A new provider is one file plus a registry entry.

## 1. Implement the `LLMProvider` interface

Create `packages/llm/src/providers/<name>.ts`:

```ts
// packages/llm/src/providers/google.ts
import type { LLMProvider, CompleteOptions, CompleteResult } from '../types.js';

export const googleProvider: LLMProvider = {
  name: 'google',
  isConfigured() {
    return !!process.env.GOOGLE_API_KEY;
  },
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    // Lazy-load the SDK so users who do not use this provider don't pay
    // for it at import time.
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    // ...call the API, return { text, usage, model }...
  },
  estimateTokens(text: string): number {
    // Use the provider's tokenizer if available; otherwise approximate.
    return Math.ceil(text.length / 4);
  },
};
```

Rules:

- Lazy-import the provider SDK inside `complete()` so it tree-shakes out
  for users on other providers.
- Return tokens used (`usage.input`, `usage.output`) so the cost-
  reporting layer can attribute spend.
- Respect `opts.signal` for abort.
- Prefer JSON / structured output mode where the provider supports it.
- On parse failure, retry once. Then surface the failure as a packet
  warning rather than throwing.

## 2. Register the provider

Edit `packages/llm/src/registry.ts`:

```ts
import { googleProvider } from './providers/google.js';

export const allProviders = [
  anthropicProvider,
  openaiProvider,
  googleProvider,    // new
  noneProvider,
];
```

Order matters for the auto-detect path. `noneProvider` stays last.

## 3. Add the SDK as an optional peer dependency

Edit `packages/cli/package.json`:

```jsonc
{
  "peerDependenciesMeta": {
    "@anthropic-ai/sdk": { "optional": true },
    "openai":             { "optional": true },
    "@google/generative-ai": { "optional": true }   // new
  }
}
```

Optional peer deps mean users only need to install the SDK for the
provider they actually use. Document the install in the provider section
of the README.

## 4. Wire configuration

A new provider is selectable through the existing configuration order:

1. `--provider google`
2. `[llm].provider = "google"` in `.baton/config.toml`
3. `GOOGLE_API_KEY` environment variable

No code change needed in `@baton/cli` once the provider is in the
registry.

## 5. Tests

Add unit tests under `packages/llm/test/providers/<name>.test.ts`:

- `isConfigured()` returns true when the env var is set, false otherwise
- `complete()` against a mocked HTTP client (no live API calls in CI)
- `estimateTokens()` returns a number for representative inputs

Add the provider to the integration test suite that runs all providers
through the four extraction prompts using a recorded mock response.

## 6. Document

- Add a paragraph to `docs/architecture.md` § `@baton/llm` listing the
  new provider.
- Add the SDK install note to the README provider section.

## 7. PR

```
feat(llm): add google provider
```

LLM provider additions usually do not need an ADR (the abstraction is
already in place). They do need passing tests, including the cost-
reporting test that asserts token counts flow through to the metrics
event.
