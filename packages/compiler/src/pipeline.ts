import { join } from 'node:path';
import { validatePacket } from '@baton/schema';
import { PacketStore } from '@baton/store';
import { getPriorPacket } from './cache.js';
import { type NormalizedInput, runFastMode, runFullMode } from './modes.js';
import { PARSERS } from './parsers/index.js';
import type { ParsedTranscript } from './parsers/types.js';
import { attachRepo } from './repo.js';
import type {
  ArtifactRef,
  CompileOptions,
  CompileResult,
  CompileWarning,
  Packet,
} from './types.js';

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Compile aborted', 'AbortError');
  }
}

export async function compile(opts: CompileOptions): Promise<CompileResult> {
  const start = Date.now();
  const warnings: CompileWarning[] = [];

  // Step 1: resolve artifacts.
  checkAborted(opts.signal);
  const parsed: Array<{ ref: ArtifactRef; value: unknown }> = [];
  for (const ref of opts.artifacts) {
    const parser = PARSERS[ref.type];
    if (parser === undefined) {
      warnings.push({
        code: 'COMPILE_UNSUPPORTED_ARTIFACT',
        severity: 'warning',
        message: `Unsupported artifact type for v1 fast mode: ${ref.type} (${ref.uri})`,
      });
      continue;
    }
    try {
      const value = await parser.parse(ref.uri, {
        ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
        repoRoot: opts.repoRoot,
      });
      parsed.push({ ref, value });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      warnings.push({
        code: 'COMPILE_PARSE_FAILED',
        severity: 'warning',
        message: `Failed to parse ${ref.type} at ${ref.uri}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }

  // Step 2: normalize.
  checkAborted(opts.signal);
  const input: NormalizedInput = {};
  for (const { ref, value } of parsed) {
    if (ref.type === 'transcript') {
      const t = value as ParsedTranscript;
      input.transcript = t;
      if (t.unrecognized) {
        warnings.push({
          code: 'COMPILE_TRANSCRIPT_UNRECOGNIZED',
          severity: 'info',
          message: `Transcript at ${ref.uri} did not match a known format; treated as plain text.`,
        });
      }
    }
  }

  // Step 3: assemble.
  checkAborted(opts.signal);
  const repoCtx = attachRepo(opts.repoRoot);
  const persistEnabled = opts.storeRoot !== false;
  const storeRoot =
    typeof opts.storeRoot === 'string' ? opts.storeRoot : join(opts.repoRoot, '.baton');

  let prior: Packet | null = null;
  let store: PacketStore | null = null;
  try {
    if (persistEnabled) {
      store = PacketStore.open(storeRoot);
      prior = await getPriorPacket(store, opts.packetId);
    }

    const now = new Date().toISOString();
    const ctx = { packetId: opts.packetId, repoCtx, now };
    const packet =
      opts.mode === 'full' ? runFullMode(input, prior, ctx) : runFastMode(input, prior, ctx);

    // Step 4: validate.
    checkAborted(opts.signal);
    const validation = validatePacket(packet);
    if (!validation.valid) {
      for (const e of validation.errors) {
        warnings.push({
          code: 'SCHEMA_INVALID',
          severity: 'error',
          message: `${e.instancePath || '<root>'} ${e.message ?? 'failed validation'}`,
        });
      }
    }

    // Step 5: persist.
    checkAborted(opts.signal);
    if (persistEnabled && store !== null && validation.valid) {
      if (prior === null) {
        store.create(packet);
      } else {
        store.update(packet);
      }
    }

    return {
      packet,
      warnings,
      usedLLM: false,
      cacheHits: 0,
      cacheMisses: 0,
      durationMs: Date.now() - start,
    };
  } finally {
    if (store !== null) store.close();
  }
}
