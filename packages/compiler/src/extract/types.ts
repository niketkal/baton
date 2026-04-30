/**
 * Public types for the LLM extraction layer (tech spec §7.2).
 *
 * Each extractor returns an `ExtractResult<T>`. On success, `value` is
 * the parsed structured payload and `warning` is undefined. On parse
 * failure (after one retry per §7.3), `value` is null and `warning`
 * carries the surfaced reason so the pipeline can keep going and
 * record it on the packet rather than aborting the whole compile.
 */

import type { AcceptanceCriterion, Attempt } from '@batonai/schema';
import type { CompileWarning } from '../types.js';

export interface ExtractResult<T> {
  value: T | null;
  /** Set when the extractor produced no usable value. */
  warning?: CompileWarning;
  /** Tokens consumed on the input side. Always recorded; 0 on cache hit. */
  tokensIn: number;
  /** Tokens produced on the output side. Always recorded; 0 on cache hit. */
  tokensOut: number;
  /**
   * `true` iff this extractor made a live LLM call. `false` for both
   * cache hits and skipped (LLM-not-configured) calls.
   */
  callLive: boolean;
  /** Provider+model recorded for cost accounting; empty string if skipped. */
  provider: string;
  model: string;
}

/**
 * The aggregate output of `runExtractors`. Narrative fields are merged
 * into the packet only when present; absent fields fall back to the
 * fast-mode draft (which itself reuses prior packet text when available).
 */
export interface ExtractedFields {
  objective?: string;
  attempts?: Attempt[];
  acceptance_criteria?: AcceptanceCriterion[];
  next_action?: string;
  confidences: {
    objective?: number;
    next_action?: number;
  };
}

export interface RunExtractorsResult {
  extracted: ExtractedFields;
  callsLive: number;
  callsCached: number;
  tokensIn: number;
  tokensOut: number;
  warnings: CompileWarning[];
  provider: string;
  model: string;
}
