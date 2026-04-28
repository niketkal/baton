import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMCache, cacheKey } from '../src/index.js';
import type { CompleteResult } from '../src/index.js';

function makeResult(text: string): CompleteResult {
  return {
    text,
    tokensIn: 1,
    tokensOut: 1,
    model: 'mock-1',
    provider: 'mock',
    cached: false,
  };
}

describe('cacheKey', () => {
  it('is stable across object key reordering', () => {
    const a = cacheKey({
      provider: 'mock',
      model: 'm',
      systemPrompt: 's',
      userPrompt: 'u',
      temperature: 0.5,
    });
    const b = cacheKey({
      // @ts-expect-error reorder for the test only
      temperature: 0.5,
      userPrompt: 'u',
      systemPrompt: 's',
      model: 'm',
      provider: 'mock',
    });
    expect(a).toBe(b);
  });

  it('changes when any input changes', () => {
    const base = cacheKey({ provider: 'mock', model: 'm', systemPrompt: 's', userPrompt: 'u' });
    expect(base).not.toBe(
      cacheKey({ provider: 'mock', model: 'm', systemPrompt: 's', userPrompt: 'u2' }),
    );
    expect(base).not.toBe(
      cacheKey({ provider: 'openai', model: 'm', systemPrompt: 's', userPrompt: 'u' }),
    );
  });
});

describe('LLMCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'baton-llm-cache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for missing keys', async () => {
    const c = new LLMCache({ root: dir });
    expect(await c.get('nope')).toBeNull();
  });

  it('round-trips a value and marks it cached on read', async () => {
    const c = new LLMCache({ root: dir });
    const key = 'abc';
    await c.set(key, makeResult('hello'));
    const got = await c.get(key);
    expect(got?.text).toBe('hello');
    expect(got?.cached).toBe(true);
  });

  it('evicts LRU entries when over budget', async () => {
    // Size budget so two entries fit but three do not.
    const big = 'X'.repeat(500);
    const probe = new LLMCache({ root: `${dir}-probe`, maxBytes: 10_000_000 });
    await probe.set('probe', makeResult(big));
    const oneEntryBytes = probe.totalBytes();
    rmSync(`${dir}-probe`, { recursive: true, force: true });
    const c = new LLMCache({ root: dir, maxBytes: oneEntryBytes * 2 + 10 });
    await c.set('a', makeResult(big));
    await new Promise((r) => setTimeout(r, 5));
    await c.set('b', makeResult(big));
    await new Promise((r) => setTimeout(r, 5));
    // Touch 'a' so 'b' becomes the LRU candidate.
    await c.get('a');
    await new Promise((r) => setTimeout(r, 5));
    await c.set('c', makeResult(big));

    expect(await c.get('b')).toBeNull();
    expect(await c.get('a')).not.toBeNull();
    expect(await c.get('c')).not.toBeNull();
    expect(c.totalBytes()).toBeLessThanOrEqual(oneEntryBytes * 2 + 10);
  });
});
