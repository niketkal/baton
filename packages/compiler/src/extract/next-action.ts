/**
 * Next-action extractor — tech spec §7.2.
 *
 * Input: a compact summary of the packet so far.
 * Output: `{ next_action, confidence }`.
 */

import type { LLMCache, LLMProvider } from '@batonai/llm';
import { renderPrompt } from './prompts.js';
import { runPrompt } from './runner.js';
import type { ExtractResult } from './types.js';

export interface NextActionValue {
  text: string;
  confidence: number;
}

function clampConfidence(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseNextAction(rawJson: string): NextActionValue {
  const obj = JSON.parse(rawJson) as Record<string, unknown>;
  if (typeof obj.next_action !== 'string' || obj.next_action.trim().length === 0) {
    throw new Error('missing or empty `next_action` field');
  }
  return {
    text: obj.next_action.trim(),
    confidence: clampConfidence(obj.confidence),
  };
}

export interface PacketSummary {
  objective: string;
  current_state: string;
  recent_attempts: string[];
}

function formatSummary(s: PacketSummary): string {
  const attemptsBlock =
    s.recent_attempts.length === 0
      ? '(none)'
      : s.recent_attempts.map((a, i) => `  ${i + 1}. ${a}`).join('\n');
  return `Objective: ${s.objective}\n\nCurrent state: ${s.current_state}\n\nRecent attempts:\n${attemptsBlock}`;
}

export async function extractNextAction(
  summary: PacketSummary,
  llm: LLMProvider,
  cache: LLMCache | null,
  signal?: AbortSignal,
): Promise<ExtractResult<NextActionValue>> {
  const prompt = renderPrompt('next-action', {
    packet_summary: formatSummary(summary),
  });
  return runPrompt<NextActionValue>(
    {
      prompt: { ...prompt, extractorName: 'next-action' },
      parse: parseNextAction,
      warningCode: 'COMPILE_LLM_PARSE_FAILED',
    },
    { llm, cache, ...(signal !== undefined ? { signal } : {}) },
  );
}
