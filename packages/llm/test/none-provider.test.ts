import { describe, expect, it } from 'vitest';
import { LLMNotConfiguredError, getProvider } from '../src/index.js';

describe('NoneProvider', () => {
  it('reports not configured', async () => {
    const p = await getProvider({ provider: 'none' });
    expect(p.isConfigured()).toBe(false);
  });

  it('throws LLMNotConfiguredError on complete()', async () => {
    const p = await getProvider({ provider: 'none' });
    await expect(p.complete({ systemPrompt: 's', userPrompt: 'u' })).rejects.toBeInstanceOf(
      LLMNotConfiguredError,
    );
  });

  it('still estimates tokens via heuristic', async () => {
    const p = await getProvider({ provider: 'none' });
    expect(p.estimateTokens('a'.repeat(40))).toBe(10);
  });
});
