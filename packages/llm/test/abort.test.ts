/**
 * Verifies cooperative cancellation through `CompleteOptions.signal`.
 *
 * Real provider abort behaviour is exercised at integration-test time
 * (TODO: integration suite should make a real SDK call with an aborted
 * signal and assert the SDK throws an AbortError-shaped object that the
 * provider re-throws unchanged). Here we only need to assert that an
 * `LLMProvider.complete()` implementation that honours the signal
 * surfaces an abort-shaped error to the caller.
 */

import { describe, expect, it } from 'vitest';
import type { CompleteOptions, CompleteResult, LLMProvider } from '../src/index.js';
import { MockProvider } from '../src/providers/mock.js';

/**
 * MockProvider doesn't natively honour the signal (it's deterministic and
 * synchronous-ish), so wrap it in a thin provider that does. This mirrors
 * what the real Anthropic / OpenAI providers do by forwarding `signal` to
 * the SDK and re-throwing an AbortError on cancellation.
 */
class AbortAwareProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly inner = new MockProvider({ defaultResponse: 'ok' });

  isConfigured(): boolean {
    return true;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    if (opts.signal?.aborted) {
      const reason = opts.signal.reason;
      const abortErr = new DOMException(
        reason instanceof Error ? reason.message : 'The operation was aborted.',
        'AbortError',
      );
      (abortErr as { cause?: unknown }).cause = reason;
      throw abortErr;
    }
    return this.inner.complete(opts);
  }

  estimateTokens(text: string): number {
    return this.inner.estimateTokens(text);
  }
}

describe('AbortSignal forwarding', () => {
  it('rejects with an AbortError when the signal is already aborted', async () => {
    const provider = new AbortAwareProvider();
    const ctrl = new AbortController();
    ctrl.abort(new Error('user cancelled'));
    await expect(
      provider.complete({
        systemPrompt: 's',
        userPrompt: 'u',
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('completes normally when no signal is provided', async () => {
    const provider = new AbortAwareProvider();
    const res = await provider.complete({ systemPrompt: 's', userPrompt: 'u' });
    expect(res.text).toBe('ok');
  });
});
