/**
 * The "none" provider — a stub used when the user has no LLM configured
 * (or has explicitly disabled LLM calls via `--fast`). It still implements
 * `estimateTokens()` so callers can size their prompts even when no real
 * model is available.
 */

import { LLMNotConfiguredError } from '../errors.js';
import { roughEstimate } from '../tokens.js';
import type { CompleteOptions, CompleteResult, LLMProvider } from '../types.js';

export class NoneProvider implements LLMProvider {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  complete(_opts: CompleteOptions): Promise<CompleteResult> {
    return Promise.reject(
      new LLMNotConfiguredError(
        'none',
        'No LLM provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or pass --fast to skip LLM calls.',
      ),
    );
  }

  estimateTokens(text: string): number {
    return roughEstimate(text);
  }
}
