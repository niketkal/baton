/**
 * OpenAI provider. Mirrors `anthropic.ts`: lazy-loads the `openai` package
 * inside `complete()` so the SDK stays an optional peer dep and doesn't
 * pull megabytes into the npx cold-start path.
 */

import { LLMNotConfiguredError, LLMProviderError } from '../errors.js';
import { estimateTokens, roughEstimate } from '../tokens.js';
import type { CompleteOptions, CompleteResult, LLMConfig, LLMProvider } from '../types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'APIUserAbortError';
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly config: LLMConfig;

  constructor(config: LLMConfig = {}) {
    this.config = config;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey || process.env.OPENAI_API_KEY);
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    if (!this.isConfigured()) {
      throw new LLMNotConfiguredError('openai');
    }
    // biome-ignore lint/suspicious/noExplicitAny: optional peer dep
    let mod: any;
    try {
      mod = await import('openai');
    } catch {
      throw new LLMNotConfiguredError(
        'openai',
        'The "openai" package is not installed. Install it as a peer dep to use the OpenAI provider.',
      );
    }
    const Client = mod.default ?? mod.OpenAI ?? mod;
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    const client = new Client({
      apiKey,
      ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {}),
    });
    const model = opts.model ?? this.config.model ?? DEFAULT_MODEL;
    try {
      const resp = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: opts.userPrompt },
          ],
          ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        },
        opts.signal ? { signal: opts.signal } : undefined,
      );
      const text = String(resp?.choices?.[0]?.message?.content ?? '');
      const tokensIn = Number(resp?.usage?.prompt_tokens ?? 0) || roughEstimate(opts.userPrompt);
      const tokensOut = Number(resp?.usage?.completion_tokens ?? 0) || roughEstimate(text);
      return {
        text,
        tokensIn,
        tokensOut,
        model: String(resp?.model ?? model),
        provider: this.name,
        cached: false,
      };
    } catch (err) {
      if (err instanceof LLMNotConfiguredError) throw err;
      if (isAbortLike(err) || opts.signal?.aborted) {
        const reason = opts.signal?.reason;
        const abortErr =
          typeof DOMException !== 'undefined'
            ? new DOMException(
                reason instanceof Error ? reason.message : 'The operation was aborted.',
                'AbortError',
              )
            : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
        (abortErr as { cause?: unknown }).cause = reason ?? err;
        throw abortErr;
      }
      throw new LLMProviderError(
        'openai',
        err instanceof Error ? err.message : 'OpenAI call failed',
        err,
      );
    }
  }

  estimateTokens(text: string): number {
    return roughEstimate(text);
  }

  /** Async tokenizer — uses `js-tiktoken` if installed. */
  estimateTokensAsync(text: string): Promise<number> {
    return estimateTokens(text, this.name);
  }
}
