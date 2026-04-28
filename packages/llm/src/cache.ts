/**
 * Content-addressable cache for LLM completions.
 *
 * - Cache keys are sha256(canonical-json) of `(provider, model, systemPrompt,
 *   userPrompt, temperature)` so identical prompts dedupe across runs.
 * - Each entry is a JSON file at `<root>/<key>.json`.
 * - LRU bookkeeping lives in `<root>/index.json`; on every `set` we evict the
 *   least-recently-used entries until total size is within `maxBytes`.
 *
 * Durability + concurrency:
 * - Index and entry writes are atomic: write-to-`*.tmp` followed by
 *   `renameSync`. POSIX guarantees readers see either the old file or the
 *   new file, never a truncated one.
 * - In-process `get`/`set` calls are serialised through a Promise chain so
 *   concurrent writes can't lose entries or corrupt the index. Cross-process
 *   serialisation is intentionally out of scope — Baton is a CLI and runs as
 *   a single process per invocation.
 * - If `index.json` is missing or unreadable we rebuild it by walking the
 *   cache directory rather than catastrophically evicting on next `set`.
 *
 * The default cache root is `<cwd>/.baton/llm-cache/` per tech spec §7.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

/** Atomic write: write to `<dest>.tmp`, then rename onto `<dest>`. */
function atomicWriteFileSync(dest: string, payload: string): void {
  // Use a per-call random suffix so concurrent writers never clobber each
  // other's tmp file before the rename.
  const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, payload, 'utf8');
  renameSync(tmp, dest);
}

export class LLMCache {
  readonly root: string;
  readonly maxBytes: number;
  private readonly indexPath: string;
  /** Promise chain that serialises in-process get/set operations. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(opts: LLMCacheOptions) {
    this.root = opts.root;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.indexPath = path.join(this.root, 'index.json');
  }

  private ensureRoot(): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
  }

  /**
   * Wrap a body so that no two cache operations on the same instance run
   * concurrently. Errors don't poison the chain — subsequent ops still run.
   */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private readIndex(): IndexFile {
    if (!existsSync(this.indexPath)) return { entries: {} };
    try {
      const raw = readFileSync(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as IndexFile;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
        throw new Error('malformed index');
      }
      return { entries: parsed.entries ?? {} };
    } catch (err) {
      // Don't return an empty index — that would let the next set() evict
      // every entry as "orphaned." Walk the cache dir and reconstruct.
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[baton/llm] cache index at ${this.indexPath} unreadable (${message}); rebuilding from disk.`,
      );
      return this.rebuildIndex();
    }
  }

  /** Walk the cache directory and reconstruct the index from files on disk. */
  private rebuildIndex(): IndexFile {
    const entries: Record<CacheKey, IndexEntry> = {};
    if (!existsSync(this.root)) return { entries };
    let names: string[] = [];
    try {
      names = readdirSync(this.root);
    } catch {
      return { entries };
    }
    for (const name of names) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      // Skip transient tmp files from a crashed write.
      if (name.includes('.tmp')) continue;
      const key = name.slice(0, -'.json'.length);
      const file = path.join(this.root, name);
      try {
        const st = statSync(file);
        entries[key] = { size: st.size, lastAccessed: st.mtimeMs };
      } catch {
        // ignore — stat could race with eviction
      }
    }
    return { entries };
  }

  private writeIndex(idx: IndexFile): void {
    this.ensureRoot();
    atomicWriteFileSync(this.indexPath, JSON.stringify(idx));
  }

  private entryPath(key: CacheKey): string {
    return path.join(this.root, `${key}.json`);
  }

  get(key: CacheKey): Promise<CompleteResult | null> {
    return this.serialize(async () => {
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
    });
  }

  set(key: CacheKey, result: CompleteResult): Promise<void> {
    return this.serialize(async () => {
      this.ensureRoot();
      const file = this.entryPath(key);
      // Persist the underlying value with `cached: false`; reads layer the flag.
      const payload = JSON.stringify({ ...result, cached: false });
      atomicWriteFileSync(file, payload);
      const size = Buffer.byteLength(payload, 'utf8');
      const idx = this.readIndex();
      idx.entries[key] = { size, lastAccessed: Date.now() };
      this.writeIndex(idx);
      this.evictInternal();
    });
  }

  /**
   * Drop the least-recently-used entries until total size is within budget.
   * Safe to call manually (used in tests). Public callers go through this
   * un-serialised wrapper because eviction is idempotent.
   */
  evict(): void {
    this.evictInternal();
  }

  private evictInternal(): void {
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
