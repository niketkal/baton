import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CompleteOptions, type CompleteResult, LLMCache, type LLMProvider } from '@baton/llm';
import { SCHEMA_VERSION } from '@baton/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runExtractors } from '../../src/extract/index.js';
import { runFullMode } from '../../src/modes.js';
import type { NormalizedInput } from '../../src/modes.js';
import type { Packet } from '../../src/types.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-extract-runner-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const input: NormalizedInput = {
  transcript: {
    tool: 'claude-code',
    rawLength: 0,
    unrecognized: false,
    messages: [{ role: 'user', text: 'help' }],
  },
};

class CannedProvider implements LLMProvider {
  readonly name = 'mock';
  callCount = 0;
  constructor(private readonly responses: string[]) {}
  isConfigured(): boolean {
    return true;
  }
  async complete(_opts: CompleteOptions): Promise<CompleteResult> {
    const i = this.callCount++;
    return {
      text: this.responses[Math.min(i, this.responses.length - 1)] ?? '',
      tokensIn: 100,
      tokensOut: 25,
      model: 'mock-1',
      provider: 'mock',
      cached: false,
    };
  }
  estimateTokens(text: string): number {
    return text.length;
  }
}

class NotConfiguredProvider implements LLMProvider {
  readonly name = 'none';
  isConfigured(): boolean {
    return false;
  }
  complete(): Promise<CompleteResult> {
    return Promise.reject(new Error('not configured'));
  }
  estimateTokens(text: string): number {
    return text.length;
  }
}

function draftPacket(): Packet {
  return {
    schema_version: SCHEMA_VERSION,
    id: 'demo',
    title: 'demo',
    status: 'draft',
    validation_level: 'draft',
    task_type: 'generic',
    objective: 'fast-mode objective',
    current_state: 'fast-mode current state',
    next_action: 'fast-mode next action',
    open_questions: [],
    confidence_score: 0.5,
    repo_context: {
      attached: false,
      root: null,
      vcs: 'none',
      branch: null,
      base_branch: null,
      commit: null,
      base_commit: null,
      dirty: false,
    },
    context_items: [],
    constraints: [],
    attempts: [],
    acceptance_criteria: [],
    warnings: [],
    provenance_links: [],
    source_artifacts: [],
    created_at: '2026-04-26T00:00:00Z',
    updated_at: '2026-04-26T00:00:00Z',
  };
}

describe('runExtractors', () => {
  it('aggregates four extractor outputs and counts live calls + tokens', async () => {
    const llm = new CannedProvider([
      '{"objective":"Aggregated objective","confidence":0.8}',
      '{"attempts":[{"summary":"a1","result":"failed","failure_reason":"reason","evidence_span":""}]}',
      '{"criteria":[{"text":"criterion 1","required":true}]}',
      '{"next_action":"Do the next thing","confidence":0.7}',
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await runExtractors(input, llm, cache, { draft: draftPacket() });
    expect(r.callsLive).toBe(4);
    expect(r.callsCached).toBe(0);
    expect(r.tokensIn).toBe(400);
    expect(r.tokensOut).toBe(100);
    expect(r.extracted.objective).toBe('Aggregated objective');
    expect(r.extracted.next_action).toBe('Do the next thing');
    expect(r.extracted.attempts).toHaveLength(1);
    expect(r.extracted.acceptance_criteria).toHaveLength(1);
    expect(r.warnings).toHaveLength(0);
  });

  it('runFullMode falls back to fast-mode draft + warns when LLM is not configured', async () => {
    const llm = new NotConfiguredProvider();
    const result = await runFullMode(
      input,
      null,
      { packetId: 'demo', repoCtx: { attached: false }, now: '2026-04-26T00:00:00Z' },
      { llm, cache: null },
    );
    expect(result.warnings.some((w) => w.code === 'COMPILE_LLM_NOT_CONFIGURED')).toBe(true);
    expect(result.callsLive).toBe(0);
    expect(result.callsCached).toBe(0);
    // Narrative fields fall through to the deterministic fast-mode draft.
    expect(typeof result.packet.objective).toBe('string');
    expect(result.packet.objective.length).toBeGreaterThan(0);
  });
});
