/**
 * Public entrypoint for `@baton/llm`. Consumers should always go through
 * `getProvider()`; the per-provider implementations are intentionally
 * NOT re-exported here so the registry stays the single seam and so the
 * heavy SDK modules can stay lazy.
 */

export { getProvider, registerProvider, listRegisteredProviders } from './registry.js';
export {
  cacheKey,
  defaultCacheRoot,
  DEFAULT_MAX_BYTES,
  LLMCache,
  type CacheKeyInput,
  type LLMCacheOptions,
} from './cache.js';
export { estimateTokens, roughEstimate } from './tokens.js';
export { LLMNotConfiguredError, LLMProviderError } from './errors.js';
export type {
  CacheKey,
  CompleteOptions,
  CompleteResult,
  LLMConfig,
  LLMProvider,
  ProviderFactory,
  ProviderName,
} from './types.js';
