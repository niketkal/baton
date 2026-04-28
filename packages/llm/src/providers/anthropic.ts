/**
 * Anthropic provider. The `@anthropic-ai/sdk` package is an OPTIONAL peer
 * dep and MUST NOT be statically imported here — see CLAUDE.md and tech
 * spec §9.2 for the npx cold-start budget.
 *
 * Every public method that needs the SDK uses a dynamic `import()` inside
 * the function body. When the package isn't installed we surface a friendly
 * `LLMNotConfiguredError` rather than a raw module-not-found.
 *
 * JSON response format:
 *   The Anthropic Messages API (SDK v0.32.x) has no native `response_format`
 *   knob equivalent to OpenAI's `{ type: 'json_object' }`. To honor
 *   `CompleteOptions.responseFormat === 'json'` consistently across providers
 *   we append a strict JSON-only instruction to the caller's system prompt.
 *   This is the workaround Anthropic itself recommends in their docs.
 */

import { LLMNotConfiguredError, LLMProviderError } from '../errors.js';
import { estimateTokens, roughEstimate } from '../tokens.js';
import type { CompleteOptions, CompleteResult, LLMConfig, LLMProvider } from '../types.js';

// TODO: revisit default model name once Anthropic publishes the next stable
// snapshot; pinning to a dated alias keeps reproducibility for v1.
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'APIUserAbortError';
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly config: LLMConfig;

  constructor(config: LLMConfig = {}) {
    this.config = config;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    if (!this.isConfigured()) {
      throw new LLMNotConfiguredError('anthropic');
    }
    // biome-ignore lint/suspicious/noExplicitAny: optional peer dep
    let mod: any;
    try {
      mod = await import('@anthropic-ai/sdk');
    } catch (err) {
      throw new LLMNotConfiguredError(
        'anthropic',
        'The "@anthropic-ai/sdk" package is not installed. Install it as a peer dep to use the Anthropic provider.',
      );
    }
    const Client = mod.default ?? mod.Anthropic ?? mod;
    const apiKey = this.config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    const client = new Client({
      apiKey,
      ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {}),
    });
    const model = opts.model ?? this.config.model ?? DEFAULT_MODEL;
    const effectiveSystemPrompt =
      opts.responseFormat === 'json'
        ? `${opts.systemPrompt}\n\nRespond ONLY with a single valid JSON object. Do not include markdown fences, prose explanations, or anything outside the JSON.`
        : opts.systemPrompt;
    try {
      const resp = await client.messages.create(
        {
          model,
          max_tokens: opts.maxTokens ?? 1024,
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          system: effectiveSystemPrompt,
          messages: [{ role: 'user', content: opts.userPrompt }],
        },
        opts.signal ? { signal: opts.signal } : undefined,
      );
      // The SDK returns `content: Array<{ type: 'text'; text: string } | …>`.
      const text = Array.isArray(resp?.content)
        ? resp.content
            // biome-ignore lint/suspicious/noExplicitAny: SDK return type
            .filter((b: any) => b?.type === 'text')
            // biome-ignore lint/suspicious/noExplicitAny: SDK return type
            .map((b: any) => String(b.text ?? ''))
            .join('')
        : String(resp?.text ?? '');
      const tokensIn = Number(resp?.usage?.input_tokens ?? 0) || roughEstimate(opts.userPrompt);
      const tokensOut = Number(resp?.usage?.output_tokens ?? 0) || roughEstimate(text);
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
      // If the SDK threw because the caller aborted, re-throw a DOMException-
      // shaped AbortError so callers can `instanceof DOMException` or check
      // `err.name === 'AbortError'`.
      if (isAbortLike(err) || opts.signal?.aborted) {
        const reason = opts.signal?.reason;
        const abortErr =
          typeof DOMException !== 'undefined'
            ? new DOMException(
                reason instanceof Error ? reason.message : 'The operation was aborted.',
                'AbortError',
              )
            : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
        // Preserve the original cause for diagnostics.
        (abortErr as { cause?: unknown }).cause = reason ?? err;
        throw abortErr;
      }
      throw new LLMProviderError(
        'anthropic',
        err instanceof Error ? err.message : 'Anthropic call failed',
        err,
      );
    }
  }

  estimateTokens(text: string): number {
    // Synchronous wrapper: kick off an async estimate but, because the
    // interface is sync, we fall back to the heuristic and let callers who
    // need precision use `estimateTokens()` from `tokens.ts` directly.
    return roughEstimate(text);
  }

  /** Async tokenizer — uses `@anthropic-ai/tokenizer` if installed. */
  estimateTokensAsync(text: string): Promise<number> {
    return estimateTokens(text, this.name);
  }
}
