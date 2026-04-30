/**
 * Acceptance-criteria extractor — tech spec §7.2.
 *
 * Inputs: objective + ticket + transcript excerpt.
 * Output: `{ criteria: [{ text, required }] }`.
 *
 * Just like attempts, the schema's `AcceptanceCriterion` carries a few
 * fields (`id`, `status`, `source`, `provenance_refs`) that we stamp
 * after parsing rather than asking the model to fabricate.
 */

import type { LLMCache, LLMProvider } from '@batonai/llm';
import type { NormalizedInput } from '../modes.js';
import { renderPrompt } from './prompts.js';
import { runPrompt } from './runner.js';
import type { ExtractResult } from './types.js';

export interface ExtractedCriterion {
  text: string;
  required: boolean;
}

function parseCriteria(rawJson: string): ExtractedCriterion[] {
  const obj = JSON.parse(rawJson) as Record<string, unknown>;
  if (!Array.isArray(obj.criteria)) {
    throw new Error('missing `criteria` array');
  }
  const out: ExtractedCriterion[] = [];
  for (const raw of obj.criteria) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.text !== 'string' || r.text.trim().length === 0) continue;
    out.push({
      text: r.text.trim(),
      required: r.required === true,
    });
  }
  return out;
}

function buildExcerpt(input: NormalizedInput): string {
  const t = input.transcript;
  if (!t) return '';
  const tail = t.messages.slice(-12);
  return tail.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
}

export async function extractAcceptanceCriteria(
  input: NormalizedInput,
  objective: string,
  llm: LLMProvider,
  cache: LLMCache | null,
  signal?: AbortSignal,
): Promise<ExtractResult<ExtractedCriterion[]>> {
  const prompt = renderPrompt('acceptance-criteria', {
    objective,
    ticket_text: '',
    transcript_excerpt: buildExcerpt(input),
  });
  return runPrompt<ExtractedCriterion[]>(
    {
      prompt: { ...prompt, extractorName: 'acceptance-criteria' },
      parse: parseCriteria,
      warningCode: 'COMPILE_LLM_PARSE_FAILED',
    },
    { llm, cache, ...(signal !== undefined ? { signal } : {}) },
  );
}
