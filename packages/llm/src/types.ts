/**
 * Public types for the @baton/llm package.
 *
 * The provider abstraction is BYOK (bring-your-own-key). Consumers use
 * `getProvider(config)` from the registry rather than importing a provider
 * directly so that provider SDKs can stay optional peer deps and lazy-load.
 */

/**
 * Built-in provider names. Open as `string` so community providers can
 * register themselves via `registerProvider()` without an upstream change.
 */
export type ProviderName = 'anthropic' | 'openai' | 'none' | 'mock' | (string & {});

/**
 * Sha256 hex digest used to address cache entries and to disambiguate
 * `complete()` calls inside the mock provider's fixture map.
 */
export type CacheKey = string;

/**
 * Inputs to `LLMProvider.complete()`. The compiler is the primary caller;
 * additional fields exist for cost reporting and cooperative cancellation.
 */
export interface CompleteOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  /**
   * Optional explicit cache key. If unset, the cache layer derives one from
   * `(provider, model, systemPrompt, userPrompt, temperature)`.
   */
  cacheKey?: CacheKey;
  signal?: AbortSignal;
  /**
   * Override the provider's default model for this single call.
   */
  model?: string;
}

/**
 * Result returned by `LLMProvider.complete()`. Cost fields are best-effort
 * estimates derived from advertised provider pricing; they are intentionally
 * a min/max range because pricing tiers and cache discounts vary.
 */
export interface CompleteResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: string;
  cached: boolean;
  estimatedCostUsdMin?: number;
  estimatedCostUsdMax?: number;
}

/**
 * Provider-agnostic configuration. `provider: 'none'` is the explicit
 * "do not call any LLM" signal used by `--fast` mode.
 */
export interface LLMConfig {
  provider?: ProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * The contract every provider implements. Implementations live under
 * `src/providers/` and are loaded through the registry.
 */
export interface LLMProvider {
  /** Stable provider identifier, e.g. `"anthropic"`. */
  readonly name: string;
  /** Whether this provider has the credentials it needs to actually call out. */
  isConfigured(): boolean;
  /** Issue one completion. Throws `LLMNotConfiguredError` if not configured. */
  complete(opts: CompleteOptions): Promise<CompleteResult>;
  /**
   * Estimate the token count of `text` for this provider's tokenizer.
   * Implementations fall back to a rough `length / 4` heuristic when the
   * tokenizer package isn't installed.
   */
  estimateTokens(text: string): number;
}

/**
 * Factory signature accepted by `registerProvider()`. Factories are stored
 * eagerly in the registry but the provider modules they reference may be
 * dynamically imported.
 */
export type ProviderFactory = (config: LLMConfig) => LLMProvider | Promise<LLMProvider>;
