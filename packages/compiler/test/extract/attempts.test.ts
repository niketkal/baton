import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CompleteOptions,
  type CompleteResult,
  LLMCache,
  type LLMProvider,
} from '@batonai/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractAttempts } from '../../src/extract/attempts.js';
import type { NormalizedInput } from '../../src/modes.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-extract-attempts-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const input: NormalizedInput = {
  transcript: {
    tool: 'claude-code',
    rawLength: 0,
    unrecognized: false,
    messages: [
      { role: 'user', text: 'Try bumping the cache TTL.' },
      { role: 'assistant', text: 'Bumped TTL to 30s, still flaky.' },
    ],
  },
};

class ScriptedProvider implements LLMProvider {
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
      tokensIn: 50,
      tokensOut: 20,
      model: 'mock-1',
      provider: 'mock',
      cached: false,
    };
  }
  estimateTokens(text: string): number {
    return text.length;
  }
}

describe('extractAttempts', () => {
  it('parses a single attempt entry', async () => {
    const llm = new ScriptedProvider([
      '{"attempts":[{"summary":"Bumped TTL","result":"failed","failure_reason":"still flaky","evidence_span":"30s, still flaky"}]}',
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractAttempts(input, llm, cache);
    expect(r.value).toHaveLength(1);
    expect(r.value?.[0]).toMatchObject({
      summary: 'Bumped TTL',
      result: 'failed',
      failure_reason: 'still flaky',
    });
    expect(r.callLive).toBe(true);
  });

  it('cached call does not hit the LLM', async () => {
    const llm = new ScriptedProvider([
      '{"attempts":[{"summary":"x","result":"unknown","failure_reason":null,"evidence_span":""}]}',
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    await extractAttempts(input, llm, cache);
    const second = await extractAttempts(input, llm, cache);
    expect(second.callLive).toBe(false);
    expect(llm.callCount).toBe(1);
  });

  it('retries once on parse failure', async () => {
    const llm = new ScriptedProvider([
      'not json',
      '{"attempts":[{"summary":"y","result":"succeeded","failure_reason":null,"evidence_span":""}]}',
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractAttempts(input, llm, cache);
    expect(r.value).toHaveLength(1);
    expect(llm.callCount).toBe(2);
  });

  it('returns null + warning after two parse failures', async () => {
    const llm = new ScriptedProvider(['nope', 'still nope']);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractAttempts(input, llm, cache);
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe('COMPILE_LLM_PARSE_FAILED');
  });
});
