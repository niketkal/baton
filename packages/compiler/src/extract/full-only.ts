/**
 * Re-export barrel reached only from `runFullMode` via dynamic import.
 *
 * Splitting this file out from `extract/index.ts` means a static-import
 * audit can prove that `runFastMode`'s import closure never includes
 * any LLM extractor module — load-bearing for CLAUDE.md invariant 2
 * (`baton failover --fast` must never reach a live LLM call).
 */

export { runExtractors } from './index.js';
export type { ExtractedFields, RunExtractorsResult } from './types.js';
