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
import { extractAcceptanceCriteria } from '../../src/extract/acceptance-criteria.js';
import type { NormalizedInput } from '../../src/modes.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-extract-ac-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const input: NormalizedInput = {
  transcript: {
    tool: 'claude-code',
    rawLength: 0,
    unrecognized: false,
    messages: [{ role: 'user', text: 'Make the test deterministic.' }],
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
      tokensIn: 70,
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

describe('extractAcceptanceCriteria', () => {
  it('parses criteria into the expected shape', async () => {
    const llm = new ScriptedProvider([
      '{"criteria":[{"text":"Test passes 100/100 runs","required":true},{"text":"No new flaky markers","required":false}]}',
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractAcceptanceCriteria(input, 'Make test deterministic', llm, cache);
    expect(r.value).toHaveLength(2);
    expect(r.value?.[0]).toEqual({ text: 'Test passes 100/100 runs', required: true });
    expect(r.value?.[1]).toEqual({ text: 'No new flaky markers', required: false });
    expect(r.callLive).toBe(true);
  });

  it('cached second call', async () => {
    const llm = new ScriptedProvider(['{"criteria":[]}']);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    await extractAcceptanceCriteria(input, 'obj', llm, cache);
    const second = await extractAcceptanceCriteria(input, 'obj', llm, cache);
    expect(second.callLive).toBe(false);
    expect(llm.callCount).toBe(1);
  });

  it('retry-once + final-failure path', async () => {
    const llm = new ScriptedProvider(['x', 'y']);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractAcceptanceCriteria(input, 'obj', llm, cache);
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe('COMPILE_LLM_PARSE_FAILED');
    expect(llm.callCount).toBe(2);
  });
});
