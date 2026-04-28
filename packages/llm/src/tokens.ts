/**
 * Token estimation helpers. Each provider gets a best-effort tokenizer that
 * lazy-loads its respective package. When the package isn't installed we
 * fall back to a `length / 4` heuristic — accurate to within ~25% for
 * English prose, which is sufficient for prompt-size budgeting and for
 * the cache-key derivation in `--fast` mode.
 */

const FALLBACK_DIVISOR = 4;

/**
 * Rough heuristic used by every provider as a fallback. Exposed so callers
 * (and tests) can compare against it without re-deriving the constant.
 */
export function roughEstimate(text: string): number {
  return Math.ceil(text.length / FALLBACK_DIVISOR);
}

/**
 * Estimate token count for `text` under `provider`'s tokenizer, lazy-loading
 * the right tokenizer package. Always returns a number; never throws.
 */
export async function estimateTokens(text: string, provider: string): Promise<number> {
  try {
    if (provider === 'anthropic') {
      // biome-ignore lint/suspicious/noExplicitAny: optional peer dep, no types at compile time
      const mod: any = await import('@anthropic-ai/tokenizer').catch(() => null);
      if (mod?.getTokenizer) {
        const tk = mod.getTokenizer();
        const ids = tk.encode?.(text);
        if (Array.isArray(ids)) return ids.length;
      }
      if (mod?.countTokens) {
        return Number(mod.countTokens(text)) || roughEstimate(text);
      }
    } else if (provider === 'openai') {
      // biome-ignore lint/suspicious/noExplicitAny: optional peer dep, no types at compile time
      const mod: any = await import('js-tiktoken').catch(() => null);
      if (mod?.getEncoding) {
        const enc = mod.getEncoding('cl100k_base');
        const ids = enc.encode(text);
        return ids.length;
      }
    }
  } catch {
    // fall through to heuristic
  }
  return roughEstimate(text);
}
