/**
 * Content-addressable cache for LLM completions.
 *
 * - Cache keys are sha256(canonical-json) of `(provider, model, systemPrompt,
 *   userPrompt, temperature)` so identical prompts dedupe across runs.
 * - Each entry is a JSON file at `<root>/<key>.json`.
 * - LRU bookkeeping lives in `<root>/index.json`; on every `set` we evict the
 *   least-recently-used entries until total size is within `maxBytes`.
 *
 * The default cache root is `<cwd>/.baton/llm-cache/` per tech spec §7.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CacheKey, CompleteResult } from './types.js';

/** Default cache size budget: 200 MB, matching the tech-spec recommendation. */
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

export interface CacheKeyInput {
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

/**
 * Stable canonical-JSON serialisation: keys are sorted so that two callers
 * passing the same logical input always produce the same hash regardless
 * of property-insertion order.
 */
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

/**
 * Derive a stable cache key. Order-independent in the input object.
 */
export function cacheKey(input: CacheKeyInput): CacheKey {
  const normalised = {
    provider: input.provider,
    model: input.model,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    temperature: input.temperature ?? 0,
  };
  return createHash('sha256').update(canonicalJSON(normalised)).digest('hex');
}

interface IndexEntry {
  size: number;
  lastAccessed: number;
}

interface IndexFile {
  entries: Record<CacheKey, IndexEntry>;
}

export interface LLMCacheOptions {
  root: string;
  maxBytes?: number;
}

export class LLMCache {
  readonly root: string;
  readonly maxBytes: number;
  private readonly indexPath: string;

  constructor(opts: LLMCacheOptions) {
    this.root = opts.root;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.indexPath = path.join(this.root, 'index.json');
  }

  private ensureRoot(): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
  }

  private readIndex(): IndexFile {
    if (!existsSync(this.indexPath)) return { entries: {} };
    try {
      const raw = readFileSync(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as IndexFile;
      return { entries: parsed.entries ?? {} };
    } catch {
      return { entries: {} };
    }
  }

  private writeIndex(idx: IndexFile): void {
    this.ensureRoot();
    writeFileSync(this.indexPath, JSON.stringify(idx), 'utf8');
  }

  private entryPath(key: CacheKey): string {
    return path.join(this.root, `${key}.json`);
  }

  async get(key: CacheKey): Promise<CompleteResult | null> {
    const file = this.entryPath(key);
    if (!existsSync(file)) return null;
    try {
      const raw = readFileSync(file, 'utf8');
      const result = JSON.parse(raw) as CompleteResult;
      // Touch LRU
      const idx = this.readIndex();
      const entry = idx.entries[key];
      if (entry) {
        entry.lastAccessed = Date.now();
        this.writeIndex(idx);
      }
      // Mark as cached on read regardless of stored value.
      return { ...result, cached: true };
    } catch {
      return null;
    }
  }

  async set(key: CacheKey, result: CompleteResult): Promise<void> {
    this.ensureRoot();
    const file = this.entryPath(key);
    // Persist the underlying value with `cached: false`; reads layer the flag.
    const payload = JSON.stringify({ ...result, cached: false });
    writeFileSync(file, payload, 'utf8');
    const size = Buffer.byteLength(payload, 'utf8');
    const idx = this.readIndex();
    idx.entries[key] = { size, lastAccessed: Date.now() };
    this.writeIndex(idx);
    this.evict();
  }

  /**
   * Drop the least-recently-used entries until total size is within budget.
   * Safe to call manually (used in tests).
   */
  evict(): void {
    const idx = this.readIndex();
    const keys = Object.keys(idx.entries);
    let total = 0;
    for (const k of keys) {
      const entry = idx.entries[k];
      if (entry) total += entry.size;
    }
    if (total <= this.maxBytes) return;
    // Sort oldest first.
    const ordered = keys
      .map((k) => ({ key: k, entry: idx.entries[k] as IndexEntry }))
      .sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);
    for (const { key, entry } of ordered) {
      if (total <= this.maxBytes) break;
      const file = this.entryPath(key);
      try {
        if (existsSync(file)) rmSync(file);
      } catch {
        // ignore — best-effort eviction
      }
      total -= entry.size;
      delete idx.entries[key];
    }
    this.writeIndex(idx);
  }

  /**
   * Total bytes tracked by the index. Useful in tests; not load-bearing for
   * cache correctness (the index is reconstructable by walking the dir).
   */
  totalBytes(): number {
    const idx = this.readIndex();
    let total = 0;
    for (const k of Object.keys(idx.entries)) {
      const e = idx.entries[k];
      if (e) total += e.size;
    }
    return total;
  }

  /**
   * On-disk size from `stat`, used by tests as a sanity check that eviction
   * actually deleted the underlying files.
   */
  diskBytes(): number {
    const idx = this.readIndex();
    let total = 0;
    for (const k of Object.keys(idx.entries)) {
      const file = this.entryPath(k);
      if (existsSync(file)) total += statSync(file).size;
    }
    return total;
  }
}

/**
 * Helper for the default cache location. Kept here so callers don't have to
 * reach into `node:path` themselves.
 */
export function defaultCacheRoot(): string {
  return path.join(process.cwd(), '.baton', 'llm-cache');
}
