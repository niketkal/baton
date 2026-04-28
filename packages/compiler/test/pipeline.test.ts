import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint } from '@baton/lint';
import { validatePacket } from '@baton/schema';
import { PacketStore } from '@baton/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as modes from '../src/modes.js';
import * as parsersIndex from '../src/parsers/index.js';
import { compile } from '../src/pipeline.js';
import type { ArtifactRef } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'transcript-claude-code-01.md');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-compiler-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

const transcriptArtifact: ArtifactRef = { type: 'transcript', uri: FIXTURE };

describe('compile (fast mode)', () => {
  it('produces a schema-valid, lint-passing packet end-to-end', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });

    expect(result.usedLLM).toBe(false);
    expect(result.cacheHits).toBe(0);
    expect(result.cacheMisses).toBe(0);
    expect(typeof result.durationMs).toBe('number');

    const v = validatePacket(result.packet);
    expect(v.valid).toBe(true);

    const report = lint(result.packet);
    const blockingErrors = report.errors;
    expect(blockingErrors).toHaveLength(0);
    expect(report.status).toBe('passed');

    // Session 9: the assemble step must attach at least one provenance
    // link so the next session's lint/render passes have something to
    // anchor against.
    expect(result.packet.provenance_links.length).toBeGreaterThan(0);
  });

  it('persists the packet to the store and the rebuild reads identical content', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    const store = PacketStore.open(join(tmp, '.baton'));
    try {
      const fromDisk = store.read('demo');
      expect(fromDisk).toEqual(result.packet);
    } finally {
      store.close();
    }
  });

  it('reuses prior packet narrative on a second fast-mode rebuild', async () => {
    await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });

    // Hand-edit a narrative field via the store to simulate a Session 11
    // LLM extraction that we want to preserve through fast-mode rebuilds.
    const store = PacketStore.open(join(tmp, '.baton'));
    try {
      const p = store.read('demo');
      store.update({ ...p, objective: 'A specific Session-11 derived objective.' });
    } finally {
      store.close();
    }

    const second = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    expect(second.packet.objective).toBe('A specific Session-11 derived objective.');
  });

  it('warns and skips unsupported artifact types', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact, { type: 'image', uri: 'placeholder.png' }],
    });
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('COMPILE_UNSUPPORTED_ARTIFACT');
    // The transcript still drove a valid packet.
    expect(validatePacket(result.packet).valid).toBe(true);
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      compile({
        packetId: 'demo',
        repoRoot: tmp,
        mode: 'fast',
        artifacts: [transcriptArtifact],
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    // Store directory should not have been created.
    expect(existsSync(join(tmp, '.baton', 'state.db'))).toBe(false);
  });

  it('rejects with AbortError when the signal fires mid-pipeline', async () => {
    const ctrl = new AbortController();
    const transcriptParser = parsersIndex.PARSERS.transcript;
    if (transcriptParser === undefined) throw new Error('transcript parser missing');
    const original = transcriptParser.parse.bind(transcriptParser);
    const spy = vi.spyOn(transcriptParser, 'parse').mockImplementation(async (uri, opts) => {
      const result = await original(uri, opts);
      ctrl.abort();
      return result;
    });
    try {
      await expect(
        compile({
          packetId: 'demo',
          repoRoot: tmp,
          mode: 'fast',
          artifacts: [transcriptArtifact],
          signal: ctrl.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      spy.mockRestore();
    }
  });

  it('returns valid: true on a successful compile', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid: false and skips persistence when the assembled packet fails schema validation', async () => {
    const spy = vi.spyOn(modes, 'runFastMode').mockImplementation((_input, _prior, ctx) => ({
      // Deliberately invalid: missing required fields like `objective`,
      // `current_state`, `next_action`, `repo_context`, etc.
      packet: {
        schema_version: 'baton.packet/v1',
        id: ctx.packetId,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed packet for test
      } as any,
      warnings: [],
    }));
    try {
      const result = await compile({
        packetId: 'demo',
        repoRoot: tmp,
        mode: 'fast',
        artifacts: [transcriptArtifact],
      });
      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.code === 'SCHEMA_INVALID')).toBe(true);
      // No packet directory should have been created on disk.
      expect(existsSync(join(tmp, '.baton', 'packets', 'demo'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('surfaces COMPILE_STORE_READ_FAILED when the store throws on read', async () => {
    // Seed a packet so getPriorPacket walks past has() into read().
    await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    const spy = vi.spyOn(PacketStore.prototype, 'read').mockImplementation(() => {
      throw new Error('simulated corrupt store');
    });
    try {
      const result = await compile({
        packetId: 'demo',
        repoRoot: tmp,
        mode: 'fast',
        artifacts: [transcriptArtifact],
      });
      const codes = result.warnings.map((w) => w.code);
      expect(codes).toContain('COMPILE_STORE_READ_FAILED');
      // Compile still completes with a valid packet (built without prior).
      expect(result.valid).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('emits COMPILE_PRIOR_SCHEMA_MISMATCH and discards prior on schema-version mismatch', async () => {
    // Seed a real prior so store.has('demo') returns true; then spy on
    // store.read to return a future-versioned (v2) packet that should
    // trip the runFastMode mismatch guard.
    const seed = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    const v2Prior = {
      ...seed.packet,
      objective: 'Stale-v2 narrative that must NOT be reused.',
      // biome-ignore lint/suspicious/noExplicitAny: deliberate future version for test
      schema_version: 'baton.packet/v2' as any,
    };
    const spy = vi.spyOn(PacketStore.prototype, 'read').mockReturnValue(v2Prior);
    try {
      const result = await compile({
        packetId: 'demo',
        repoRoot: tmp,
        mode: 'fast',
        artifacts: [transcriptArtifact],
      });
      const codes = result.warnings.map((w) => w.code);
      expect(codes).toContain('COMPILE_PRIOR_SCHEMA_MISMATCH');
      expect(result.packet.objective).not.toBe('Stale-v2 narrative that must NOT be reused.');
      expect(result.packet.schema_version).toBe('baton.packet/v1');
      expect(result.valid).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
