import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

  it('serialises concurrent set() calls without losing entries or busting the budget', async () => {
    const big = 'Y'.repeat(1024);
    // Size budget for ~3 entries; 10 concurrent sets must evict down to it.
    const probe = new LLMCache({ root: `${dir}-probe2`, maxBytes: 10_000_000 });
    await probe.set('probe', makeResult(big));
    const oneEntryBytes = probe.totalBytes();
    rmSync(`${dir}-probe2`, { recursive: true, force: true });

    const maxBytes = oneEntryBytes * 3 + 16;
    const c = new LLMCache({ root: dir, maxBytes });
    const writes = Array.from({ length: 10 }, (_, i) => c.set(`k${i}`, makeResult(big)));
    await Promise.all(writes);

    // Index byte total within budget.
    expect(c.totalBytes()).toBeLessThanOrEqual(maxBytes);
    // No orphan files: every `<key>.json` must be in the index, and every
    // index entry must have its file on disk.
    const onDisk = new Set(
      readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json'),
    );
    expect(c.diskBytes()).toBeLessThanOrEqual(maxBytes);
    // Pull keys from the index by stat-ing the files: round-trip via get().
    let presentInIndex = 0;
    for (let i = 0; i < 10; i++) {
      const got = await c.get(`k${i}`);
      if (got !== null) presentInIndex++;
    }
    // Files-on-disk count matches index-tracked entries.
    expect(onDisk.size).toBe(presentInIndex);
  });

  it('survives a corrupted index.json by rebuilding from disk', async () => {
    const c1 = new LLMCache({ root: dir });
    await c1.set('keep-me', makeResult('payload'));
    // Corrupt the index.
    writeFileSync(path.join(dir, 'index.json'), '{not json at all', 'utf8');
    // New instance — should not throw on read or write.
    const c2 = new LLMCache({ root: dir });
    await expect(c2.set('new-one', makeResult('also-payload'))).resolves.toBeUndefined();
    // Original entry should still be retrievable because rebuild walked
    // the dir rather than catastrophically evicting.
    const kept = await c2.get('keep-me');
    expect(kept?.text).toBe('payload');
    const fresh = await c2.get('new-one');
    expect(fresh?.text).toBe('also-payload');
  });
});
