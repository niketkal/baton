/**
 * Deterministic mock provider. Used by every later session's tests so that
 * CI never makes real network calls. Given identical input it always
 * returns identical output.
 *
 * Behaviour:
 * - If a fixture exists for the derived cache key, return it.
 * - Otherwise return `defaultResponse` (or `'<mock>'`) with token counts
 *   derived from the rough heuristic.
 */

import { cacheKey } from '../cache.js';
import { roughEstimate } from '../tokens.js';
import type { CacheKey, CompleteOptions, CompleteResult, LLMProvider } from '../types.js';

export interface MockProviderOptions {
  fixtures?: Map<CacheKey, CompleteResult>;
  defaultResponse?: string;
  /** Override the model name reported in results. */
  model?: string;
}

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly fixtures: Map<CacheKey, CompleteResult>;
  private readonly defaultResponse: string;
  private readonly model: string;

  constructor(opts: MockProviderOptions = {}) {
    this.fixtures = opts.fixtures ?? new Map();
    this.defaultResponse = opts.defaultResponse ?? '<mock>';
    this.model = opts.model ?? 'mock-1';
  }

  isConfigured(): boolean {
    return true;
  }

  /**
   * Add or replace a fixture entry. Call sites typically pre-derive the key
   * via `keyFor()` so they don't have to duplicate the hashing logic.
   */
  setFixture(key: CacheKey, result: CompleteResult): void {
    this.fixtures.set(key, result);
  }

  /**
   * Public so tests can pre-derive the key for a fixture insertion without
   * duplicating the hashing logic.
   */
  keyFor(opts: CompleteOptions): CacheKey {
    return cacheKey({
      provider: this.name,
      model: opts.model ?? this.model,
      systemPrompt: opts.systemPrompt,
      userPrompt: opts.userPrompt,
      temperature: opts.temperature ?? 0,
    });
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const key = opts.cacheKey ?? this.keyFor(opts);
    const fixture = this.fixtures.get(key);
    if (fixture) return { ...fixture, cached: false };
    const text = this.defaultResponse;
    return {
      text,
      tokensIn: roughEstimate(opts.systemPrompt + opts.userPrompt),
      tokensOut: roughEstimate(text),
      model: opts.model ?? this.model,
      provider: this.name,
      cached: false,
    };
  }

  estimateTokens(text: string): number {
    return roughEstimate(text);
  }
}
