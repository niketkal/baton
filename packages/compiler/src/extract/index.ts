/**
 * Aggregate runner for the four LLM extractors (tech spec §7.2).
 *
 * Order matters: objective → attempts → acceptance-criteria →
 * next-action. We deliberately run them sequentially rather than in
 * parallel:
 *
 *   1. acceptance-criteria depends on the extracted objective.
 *   2. next-action depends on a compact summary of everything else.
 *   3. Sequential execution surfaces token cost in a predictable order
 *      in the cost block printed to the user (§7.5).
 *
 * Each extractor independently consults the cache, so a re-run is fast
 * even though the call sequence is serial.
 */

import type { LLMCache, LLMProvider } from '@batonai/llm';
import type { NormalizedInput } from '../modes.js';
import type { CompileWarning, Packet } from '../types.js';
import { extractAcceptanceCriteria } from './acceptance-criteria.js';
import { extractAttempts } from './attempts.js';
import { extractNextAction } from './next-action.js';
import { extractObjective } from './objective.js';
import type { ExtractResult, ExtractedFields, RunExtractorsResult } from './types.js';

export type { ExtractedFields, RunExtractorsResult } from './types.js';

export interface RunExtractorsContext {
  /** Used by the next-action extractor's "current state" hint. */
  draft: Packet;
}

function tally<T>(
  acc: { callsLive: number; callsCached: number; tokensIn: number; tokensOut: number },
  r: ExtractResult<T>,
): void {
  acc.tokensIn += r.tokensIn;
  acc.tokensOut += r.tokensOut;
  if (r.callLive) acc.callsLive += 1;
  // A cache hit is signalled by callLive=false and tokensIn==0; we
  // count those as cached calls. A skipped (LLM-not-configured) call
  // never enters this code path.
  else acc.callsCached += 1;
}

function pushWarning<T>(warnings: CompileWarning[], r: ExtractResult<T>): void {
  if (r.warning) warnings.push(r.warning);
}

export async function runExtractors(
  input: NormalizedInput,
  llm: LLMProvider,
  cache: LLMCache | null,
  ctx: RunExtractorsContext,
  signal?: AbortSignal,
): Promise<RunExtractorsResult> {
  const warnings: CompileWarning[] = [];
  const tally0 = { callsLive: 0, callsCached: 0, tokensIn: 0, tokensOut: 0 };
  let provider = llm.name;
  let model = '';

  // 1. Objective
  const objective = await extractObjective(input, llm, cache, signal);
  tally(tally0, objective);
  pushWarning(warnings, objective);
  if (objective.model) {
    provider = objective.provider || provider;
    model = objective.model;
  }

  // 2. Attempts
  const attempts = await extractAttempts(input, llm, cache, signal);
  tally(tally0, attempts);
  pushWarning(warnings, attempts);
  if (attempts.model) model = attempts.model;

  // 3. Acceptance criteria — needs the objective text. Fall back to
  // the draft packet's objective if the LLM didn't give us one.
  const objectiveText = objective.value?.text ?? ctx.draft.objective ?? '';
  const acceptance = await extractAcceptanceCriteria(input, objectiveText, llm, cache, signal);
  tally(tally0, acceptance);
  pushWarning(warnings, acceptance);
  if (acceptance.model) model = acceptance.model;

  // 4. Next action — needs a summary of what we have so far.
  const recentAttemptSummaries = (attempts.value ?? []).slice(-5).map((a) => a.summary);
  const nextAction = await extractNextAction(
    {
      objective: objectiveText,
      current_state: ctx.draft.current_state,
      recent_attempts: recentAttemptSummaries,
    },
    llm,
    cache,
    signal,
  );
  tally(tally0, nextAction);
  pushWarning(warnings, nextAction);
  if (nextAction.model) model = nextAction.model;

  // Stamp the schema-required fields the model didn't fabricate.
  const now = ctx.draft.updated_at;
  const stampedAttempts =
    attempts.value === null
      ? undefined
      : attempts.value.map((a, i) => ({
          id: `attempt-${i + 1}`,
          tool: 'unknown',
          summary: a.summary,
          result: a.result,
          failure_reason: a.failure_reason,
          artifact_refs: [] as string[],
          created_at: now,
        }));

  const stampedCriteria =
    acceptance.value === null
      ? undefined
      : acceptance.value.map((c, i) => ({
          id: `ac-${i + 1}`,
          text: c.text,
          status: 'unknown' as const,
          required: c.required,
          source: 'derived' as const,
          provenance_refs: [] as string[],
        }));

  const extracted: ExtractedFields = {
    confidences: {},
  };
  if (objective.value) {
    extracted.objective = objective.value.text;
    extracted.confidences.objective = objective.value.confidence;
  }
  if (stampedAttempts) extracted.attempts = stampedAttempts;
  if (stampedCriteria) extracted.acceptance_criteria = stampedCriteria;
  if (nextAction.value) {
    extracted.next_action = nextAction.value.text;
    extracted.confidences.next_action = nextAction.value.confidence;
  }

  return {
    extracted,
    callsLive: tally0.callsLive,
    callsCached: tally0.callsCached,
    tokensIn: tally0.tokensIn,
    tokensOut: tally0.tokensOut,
    warnings,
    provider,
    model,
  };
}
