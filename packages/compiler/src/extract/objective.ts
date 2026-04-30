/**
 * Objective extractor — tech spec §7.2.
 *
 * Inputs: transcript excerpt + ticket text.
 * Output: `{ objective, confidence }`.
 */

import type { LLMCache, LLMProvider } from '@batonai/llm';
import type { NormalizedInput } from '../modes.js';
import { renderPrompt } from './prompts.js';
import { runPrompt } from './runner.js';
import type { ExtractResult } from './types.js';

export interface ObjectiveValue {
  text: string;
  confidence: number;
}

function clampConfidence(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseObjective(rawJson: string): ObjectiveValue {
  const obj = JSON.parse(rawJson) as Record<string, unknown>;
  if (typeof obj.objective !== 'string' || obj.objective.trim().length === 0) {
    throw new Error('missing or empty `objective` field');
  }
  return {
    text: obj.objective.trim(),
    confidence: clampConfidence(obj.confidence),
  };
}

function buildExcerpt(input: NormalizedInput): string {
  const t = input.transcript;
  if (!t) return '';
  // Trim long transcripts to keep prompt cost bounded. Use the last
  // ~12 messages as a heuristic — that's what the tech spec suggests
  // for "transcript excerpt" inputs.
  const tail = t.messages.slice(-12);
  return tail.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
}

function buildTicketText(input: NormalizedInput): string {
  // v1 doesn't yet wire issue artifacts into NormalizedInput; leave a
  // hook here so when Session 7+'s issue parser lands the wire-up is
  // a one-liner.
  void input;
  return '';
}

export async function extractObjective(
  input: NormalizedInput,
  llm: LLMProvider,
  cache: LLMCache | null,
  signal?: AbortSignal,
): Promise<ExtractResult<ObjectiveValue>> {
  const prompt = renderPrompt('objective', {
    transcript_excerpt: buildExcerpt(input),
    ticket_text: buildTicketText(input),
  });
  return runPrompt<ObjectiveValue>(
    {
      prompt: { ...prompt, extractorName: 'objective' },
      parse: parseObjective,
      warningCode: 'COMPILE_LLM_PARSE_FAILED',
    },
    { llm, cache, ...(signal !== undefined ? { signal } : {}) },
  );
}
