/**
 * Attempts extractor — tech spec §7.2.
 *
 * Inputs: transcript excerpt.
 * Output: `{ attempts: [{ summary, result, failure_reason, evidence_span }] }`.
 *
 * The schema-level `Attempt` shape requires extra fields (`id`, `tool`,
 * `artifact_refs`, `created_at`) which we don't ask the model to make
 * up. The pipeline stamps those on after parsing.
 */

import type { LLMCache, LLMProvider } from '@batonai/llm';
import type { Attempt } from '@batonai/schema';
import type { NormalizedInput } from '../modes.js';
import { renderPrompt } from './prompts.js';
import { runPrompt } from './runner.js';
import type { ExtractResult } from './types.js';

export interface ExtractedAttempt {
  summary: string;
  result: Attempt['result'];
  failure_reason: string | null;
  evidence_span: string;
}

const VALID_RESULTS = new Set<Attempt['result']>([
  'succeeded',
  'failed',
  'partial',
  'blocked',
  'abandoned',
  'unknown',
]);

function coerceResult(v: unknown): Attempt['result'] {
  if (typeof v === 'string' && VALID_RESULTS.has(v as Attempt['result'])) {
    return v as Attempt['result'];
  }
  return 'unknown';
}

function parseAttempts(rawJson: string): ExtractedAttempt[] {
  const obj = JSON.parse(rawJson) as Record<string, unknown>;
  if (!Array.isArray(obj.attempts)) {
    throw new Error('missing `attempts` array');
  }
  const out: ExtractedAttempt[] = [];
  for (const raw of obj.attempts) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.summary !== 'string' || r.summary.trim().length === 0) continue;
    out.push({
      summary: r.summary.trim(),
      result: coerceResult(r.result),
      failure_reason:
        typeof r.failure_reason === 'string' && r.failure_reason.trim().length > 0
          ? r.failure_reason.trim()
          : null,
      evidence_span: typeof r.evidence_span === 'string' ? r.evidence_span.slice(0, 240) : '',
    });
  }
  return out;
}

function buildExcerpt(input: NormalizedInput): string {
  const t = input.transcript;
  if (!t) return '';
  return t.messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
}

export async function extractAttempts(
  input: NormalizedInput,
  llm: LLMProvider,
  cache: LLMCache | null,
  signal?: AbortSignal,
): Promise<ExtractResult<ExtractedAttempt[]>> {
  const prompt = renderPrompt('attempts', {
    transcript_excerpt: buildExcerpt(input),
  });
  return runPrompt<ExtractedAttempt[]>(
    {
      prompt: { ...prompt, extractorName: 'attempts' },
      parse: parseAttempts,
      warningCode: 'COMPILE_LLM_PARSE_FAILED',
    },
    { llm, cache, ...(signal !== undefined ? { signal } : {}) },
  );
}
