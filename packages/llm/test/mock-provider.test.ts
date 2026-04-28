import { describe, expect, it } from 'vitest';
import type { CompleteOptions, CompleteResult } from '../src/index.js';
import { MockProvider } from '../src/providers/mock.js';

describe('MockProvider', () => {
  const opts: CompleteOptions = { systemPrompt: 'sys', userPrompt: 'usr', temperature: 0 };

  it('is always configured', () => {
    expect(new MockProvider().isConfigured()).toBe(true);
  });

  it('returns deterministic output for identical input', async () => {
    const p = new MockProvider({ defaultResponse: 'hello' });
    const a = await p.complete(opts);
    const b = await p.complete(opts);
    expect(a).toEqual(b);
    expect(a.text).toBe('hello');
    expect(a.provider).toBe('mock');
  });

  it('returns the fixture when its key matches', async () => {
    const p = new MockProvider();
    const fixture: CompleteResult = {
      text: 'fixture-response',
      tokensIn: 3,
      tokensOut: 4,
      model: 'mock-1',
      provider: 'mock',
      cached: false,
    };
    p.setFixture(p.keyFor(opts), fixture);
    const res = await p.complete(opts);
    expect(res.text).toBe('fixture-response');
  });

  it('falls back to defaultResponse when no fixture matches', async () => {
    const p = new MockProvider({ defaultResponse: '<<default>>' });
    const res = await p.complete(opts);
    expect(res.text).toBe('<<default>>');
  });

  it('estimateTokens uses the rough heuristic', () => {
    expect(new MockProvider().estimateTokens('1234567890')).toBe(3);
  });
});
