import { join } from 'node:path';
import { validatePacket } from '@baton/schema';
import { PacketStore } from '@baton/store';
import { getPriorPacket } from './cache.js';
import * as modes from './modes.js';
import type { NormalizedInput } from './modes.js';
import { PARSERS } from './parsers/index.js';
import type { ParsedTranscript } from './parsers/types.js';
import { attachProvenanceLinks } from './provenance.js';
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
    checkAborted(opts.signal);
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
    checkAborted(opts.signal);
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
  const repoCtx = await attachRepo({ root: opts.repoRoot });
  const persistEnabled = opts.storeRoot !== false;
  // PacketStore.open takes the repo root and appends `.baton` itself
  // (see @baton/store paths.resolvePaths). If the caller supplied an
  // explicit storeRoot string we use it verbatim — same contract.
  const storeRoot = typeof opts.storeRoot === 'string' ? opts.storeRoot : opts.repoRoot;

  let prior: Packet | null = null;
  let store: PacketStore | null = null;
  let storeReadFailed = false;
  try {
    if (persistEnabled) {
      store = PacketStore.open(storeRoot);
      const priorResult = await getPriorPacket(store, opts.packetId);
      prior = priorResult.packet;
      if (priorResult.warning !== undefined) {
        warnings.push(priorResult.warning);
        storeReadFailed = true;
      }
    }

    const now = new Date().toISOString();
    const ctx = { packetId: opts.packetId, repoCtx, now };
    let modeResult: modes.ModeResult;
    if (opts.mode === 'full') {
      // Resolve LLM + cache lazily so the fast-mode happy path never
      // pays for `@baton/llm` imports (CLAUDE.md invariant 2).
      const { getProvider, LLMCache, defaultCacheRoot } = await import('@baton/llm');
      const llm = opts.llm ?? (await getProvider({}));
      const cache =
        opts.cache === null
          ? null
          : opts.cache !== undefined
            ? opts.cache
            : new LLMCache({
                root:
                  typeof opts.storeRoot === 'string'
                    ? join(opts.storeRoot, 'llm-cache')
                    : defaultCacheRoot(),
              });
      modeResult = await modes.runFullMode(input, prior, ctx, {
        llm,
        cache,
        ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      });
    } else {
      modeResult = modes.runFastMode(input, prior, ctx);
    }
    const assembled = modeResult.packet;
    warnings.push(...modeResult.warnings);

    // Step 3.5: attach provenance links + source artifacts. Runs after
    // assemble so it sees the final narrative fields the mode chose,
    // and before validate so any provenance-shaped schema violation
    // surfaces alongside the rest.
    const packet: Packet = attachProvenanceLinks(assembled, input);

    // Step 4: validate.
    checkAborted(opts.signal);
    const validation = validatePacket(packet);
    if (!validation.valid) {
      for (const e of validation.errors) {
        warnings.push({
          code: 'SCHEMA_INVALID',
          severity: 'error',
          message: `${e.instancePath || '<root>'} ${e.message ?? 'failed validation'}`,
          path: e.instancePath,
          data: { keyword: e.keyword, params: e.params },
        });
      }
    }

    // Step 5: persist. Skip when the store-read step failed: we can't
    // tell whether the packet already exists on disk, and overwriting
    // blindly risks compounding the corruption.
    checkAborted(opts.signal);
    if (persistEnabled && store !== null && validation.valid && !storeReadFailed) {
      if (prior === null) {
        store.create(packet);
      } else {
        store.update(packet);
      }
    }

    const callsLive = modeResult.callsLive ?? 0;
    const callsCached = modeResult.callsCached ?? 0;
    const result: CompileResult = {
      packet,
      warnings,
      valid: validation.valid,
      usedLLM: callsLive > 0,
      cacheHits: callsCached,
      cacheMisses: callsLive,
      durationMs: Date.now() - start,
    };
    if (modeResult.tokensIn !== undefined) result.tokensIn = modeResult.tokensIn;
    if (modeResult.tokensOut !== undefined) result.tokensOut = modeResult.tokensOut;
    if (modeResult.provider) result.llmProvider = modeResult.provider;
    if (modeResult.model) result.llmModel = modeResult.model;
    return result;
  } finally {
    if (store !== null) store.close();
  }
}
