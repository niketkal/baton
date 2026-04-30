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
import { extractObjective } from '../../src/extract/objective.js';
import { renderPrompt } from '../../src/extract/prompts.js';
import type { NormalizedInput } from '../../src/modes.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-extract-objective-'));
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
      { role: 'user', text: 'Fix the flaky auth-flow.spec.ts test.' },
      { role: 'assistant', text: 'Looking at the fixture loader.' },
    ],
  },
};

interface ScriptedResponse {
  text: string;
}

class ScriptedProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly script: ScriptedResponse[];
  callCount = 0;
  constructor(responses: ScriptedResponse[]) {
    this.script = responses;
  }
  isConfigured(): boolean {
    return true;
  }
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const i = this.callCount++;
    const r = this.script[Math.min(i, this.script.length - 1)];
    return {
      text: r?.text ?? '<empty>',
      tokensIn: 100,
      tokensOut: 30,
      model: 'mock-1',
      provider: this.name,
      cached: false,
    };
  }
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

describe('extractObjective', () => {
  it('returns the parsed objective and counts a live call', async () => {
    const llm = new ScriptedProvider([
      { text: '{"objective":"Fix flaky auth test","confidence":0.7}' },
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const result = await extractObjective(input, llm, cache);
    expect(result.value).toEqual({ text: 'Fix flaky auth test', confidence: 0.7 });
    expect(result.callLive).toBe(true);
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(30);
    expect(result.warning).toBeUndefined();
    expect(llm.callCount).toBe(1);
  });

  it('serves a second call from the cache without hitting the LLM', async () => {
    const llm = new ScriptedProvider([
      { text: '{"objective":"Fix flaky auth test","confidence":0.7}' },
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    await extractObjective(input, llm, cache);
    const second = await extractObjective(input, llm, cache);
    expect(second.callLive).toBe(false);
    expect(second.tokensIn).toBe(0);
    expect(second.tokensOut).toBe(0);
    expect(second.value?.text).toBe('Fix flaky auth test');
    expect(llm.callCount).toBe(1);
  });

  it('retries once on parse failure and succeeds the second time', async () => {
    const llm = new ScriptedProvider([
      { text: 'not json at all' },
      { text: '{"objective":"Fix flaky auth test","confidence":0.5}' },
    ]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const result = await extractObjective(input, llm, cache);
    expect(result.value?.text).toBe('Fix flaky auth test');
    expect(llm.callCount).toBe(2);
    expect(result.tokensIn).toBe(200);
    expect(result.tokensOut).toBe(60);
  });

  it('returns null + a warning after two consecutive parse failures', async () => {
    const llm = new ScriptedProvider([{ text: 'not json' }, { text: 'still not json' }]);
    const cache = new LLMCache({ root: join(tmp, 'cache') });
    const result = await extractObjective(input, llm, cache);
    expect(result.value).toBeNull();
    expect(result.warning?.code).toBe('COMPILE_LLM_PARSE_FAILED');
    expect(llm.callCount).toBe(2);
  });

  it('renders the prompt with transcript_excerpt interpolated', () => {
    const tpl = renderPrompt('objective', {
      transcript_excerpt: 'USER: hello',
      ticket_text: '',
    });
    expect(tpl.user).toContain('USER: hello');
    expect(tpl.user).not.toContain('{{transcript_excerpt}}');
    expect(tpl.system.length).toBeGreaterThan(0);
  });
});
