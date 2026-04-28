import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProvider, listRegisteredProviders, registerProvider } from '../src/index.js';
import type { LLMProvider } from '../src/index.js';

describe('registry', () => {
  let savedAnthropic: string | undefined;
  let savedOpenAI: string | undefined;

  beforeEach(() => {
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    savedOpenAI = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = undefined;
    process.env.OPENAI_API_KEY = undefined;
    // `delete` would trip biome's noDelete; assigning undefined then
    // pruning via Reflect keeps the env dictionary clean while staying
    // lint-clean.
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
    Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
  });

  afterEach(() => {
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    else Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
    if (savedOpenAI !== undefined) process.env.OPENAI_API_KEY = savedOpenAI;
    else Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
  });

  it('honours explicit provider config', async () => {
    const p = await getProvider({ provider: 'mock' });
    expect(p.name).toBe('mock');
  });

  it('selects anthropic when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const p = await getProvider();
    expect(p.name).toBe('anthropic');
  });

  it('selects openai when only OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const p = await getProvider();
    expect(p.name).toBe('openai');
  });

  it('prefers anthropic when both env vars are set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    const p = await getProvider();
    expect(p.name).toBe('anthropic');
  });

  it('falls back to "none" when nothing is configured', async () => {
    const p = await getProvider();
    expect(p.name).toBe('none');
    expect(p.isConfigured()).toBe(false);
  });

  it('round-trips a registered community provider', async () => {
    const fake: LLMProvider = {
      name: 'community-test',
      isConfigured: () => true,
      complete: async () => ({
        text: 'hi',
        tokensIn: 1,
        tokensOut: 1,
        model: 'x',
        provider: 'community-test',
        cached: false,
      }),
      estimateTokens: () => 1,
    };
    registerProvider('community-test', () => fake);
    expect(listRegisteredProviders()).toContain('community-test');
    const p = await getProvider({ provider: 'community-test' });
    expect(p.name).toBe('community-test');
  });

  it('falls back to "none" for unknown provider names', async () => {
    const p = await getProvider({ provider: 'does-not-exist' });
    expect(p.name).toBe('none');
  });
});
