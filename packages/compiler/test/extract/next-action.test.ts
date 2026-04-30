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
import { extractNextAction } from '../../src/extract/next-action.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-extract-na-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

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
      tokensIn: 40,
      tokensOut: 10,
      model: 'mock-1',
      provider: 'mock',
      cached: false,
    };
  }
  estimateTokens(text: string): number {
    return text.length;
  }
}

const summary = {
  objective: 'Fix flaky test',
  current_state: 'Bumping TTL did not help',
  recent_attempts: ['Bumped TTL'],
};

describe('extractNextAction', () => {
  it('parses next_action + confidence', async () => {
    const llm = new ScriptedProvider([
      '{"next_action":"Reproduce under --repeat-each=10","confidence":0.6}',
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractNextAction(summary, llm, cache);
    expect(r.value).toEqual({
      text: 'Reproduce under --repeat-each=10',
      confidence: 0.6,
    });
    expect(r.callLive).toBe(true);
  });

  it('cached call does not hit the LLM', async () => {
    const llm = new ScriptedProvider(['{"next_action":"Run the test","confidence":0.5}']);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    await extractNextAction(summary, llm, cache);
    const second = await extractNextAction(summary, llm, cache);
    expect(second.callLive).toBe(false);
    expect(llm.callCount).toBe(1);
  });

  it('retry-once on parse failure', async () => {
    const llm = new ScriptedProvider(['not json', '{"next_action":"go","confidence":0.4}']);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractNextAction(summary, llm, cache);
    expect(r.value?.text).toBe('go');
    expect(llm.callCount).toBe(2);
  });

  it('null + warning after two failures', async () => {
    const llm = new ScriptedProvider(['x', 'y']);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const r = await extractNextAction(summary, llm, cache);
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe('COMPILE_LLM_PARSE_FAILED');
  });
});
