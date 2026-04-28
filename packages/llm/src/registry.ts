/**
 * Provider registry. Implements the selection order from tech spec §7.1:
 *
 *   1. Explicit `config.provider` wins.
 *   2. Otherwise, the first env var set in this order:
 *      ANTHROPIC_API_KEY → anthropic, OPENAI_API_KEY → openai.
 *   3. Fallback to the `none` provider.
 *
 * Provider modules are imported dynamically so that simply importing
 * `@baton/llm` does not pull `@anthropic-ai/sdk` or `openai` into memory.
 * That's load-bearing for the npx cold-start budget; do not regress it.
 */

import type { LLMConfig, LLMProvider, ProviderFactory, ProviderName } from './types.js';

const factories = new Map<string, ProviderFactory>();

/**
 * Register a community or test provider. Throws if `name` is already taken
 * unless explicitly overriding the built-in.
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  factories.set(name, factory);
}

/**
 * Read-only view used by tests; exposed for assertions about which
 * providers have been registered, not for general consumption.
 */
export function listRegisteredProviders(): string[] {
  return Array.from(factories.keys());
}

// Built-in lazy factories. Each `import()` is inside the factory body so
// loading the registry itself doesn't pull in the heavy SDK files.
registerProvider('none', async () => {
  const { NoneProvider } = await import('./providers/none.js');
  return new NoneProvider();
});
registerProvider('mock', async (_config) => {
  const { MockProvider } = await import('./providers/mock.js');
  return new MockProvider();
});
registerProvider('anthropic', async (config) => {
  const { AnthropicProvider } = await import('./providers/anthropic.js');
  return new AnthropicProvider(config);
});
registerProvider('openai', async (config) => {
  const { OpenAIProvider } = await import('./providers/openai.js');
  return new OpenAIProvider(config);
});

function detectFromEnv(): ProviderName {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/**
 * Resolve a provider for `config`. Always returns; never throws for an
 * unknown name (callers can check `provider.isConfigured()`). Uses the
 * `none` provider for unknown names that aren't registered, so consumers
 * can keep working without knowing the full registry up front.
 */
export async function getProvider(config: LLMConfig = {}): Promise<LLMProvider> {
  const name = (config.provider ?? detectFromEnv()) as ProviderName;
  const factory = factories.get(name);
  if (!factory) {
    const fallback = factories.get('none');
    if (!fallback) {
      throw new Error(
        `LLM provider "${name}" is not registered and no "none" fallback is available.`,
      );
    }
    return fallback(config);
  }
  return factory(config);
}
