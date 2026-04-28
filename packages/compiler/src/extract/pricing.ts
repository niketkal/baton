/**
 * Per-model price hints for the cost reporter (tech spec §7.5).
 *
 * Numbers are in USD per 1,000 tokens. Sources are the providers'
 * published price pages at time of writing; they drift, and we are NOT
 * committing to keeping them current. The cost block we print to the
 * user always carries an explicit "estimated" / range framing so that
 * stale numbers here do not turn into false precision in the UI.
 *
 * If a `(provider, model)` pair isn't in the table, the caller should
 * omit the cost line rather than fabricate a number.
 *
 * Initial entries (2025-era reference prices):
 *   - anthropic / claude-sonnet-4-5: $3 / $15 per 1M tokens
 *     (https://www.anthropic.com/pricing)
 *   - openai / gpt-4o-mini: $0.15 / $0.60 per 1M tokens
 *     (https://openai.com/api/pricing)
 *
 * The min/max range exists because token-count estimation is imprecise:
 * provider tokenizers and our heuristic estimator differ by up to ~50%
 * on short prompts. We surface that uncertainty rather than hide it.
 */

export interface ModelPricing {
  provider: string;
  model: string;
  /** USD per 1,000 input tokens. */
  inputCostPer1KTokens: number;
  /** USD per 1,000 output tokens. */
  outputCostPer1KTokens: number;
}

export const PRICING_TABLE: ModelPricing[] = [
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    inputCostPer1KTokens: 0.003,
    outputCostPer1KTokens: 0.015,
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputCostPer1KTokens: 0.00015,
    outputCostPer1KTokens: 0.0006,
  },
];

export interface CostEstimate {
  min: number;
  max: number;
}

/**
 * Compute a min/max USD estimate for a `(provider, model, tokensIn,
 * tokensOut)` tuple. Returns `null` if we don't have a price entry.
 *
 * The 25% spread on each side reflects our token-count uncertainty.
 */
export function estimateCostUsd(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
): CostEstimate | null {
  const entry = PRICING_TABLE.find((p) => p.provider === provider && p.model === model);
  if (!entry) return null;
  const point =
    (tokensIn / 1000) * entry.inputCostPer1KTokens +
    (tokensOut / 1000) * entry.outputCostPer1KTokens;
  // Spread +/- 25% to acknowledge token-count imprecision.
  const min = point * 0.75;
  const max = point * 1.25;
  return { min, max };
}

/** Return the matching entry or null. Useful for the "do we even know
 * how to price this?" check before printing a cost line. */
export function findPricing(provider: string, model: string): ModelPricing | null {
  const entry = PRICING_TABLE.find((p) => p.provider === provider && p.model === model);
  return entry ?? null;
}
