import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint } from '@baton/lint';
import { validatePacket } from '@baton/schema';
import { PacketStore } from '@baton/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../src/pipeline.js';
import type { ArtifactRef } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'transcript-claude-code-01.md');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-compiler-'));
});

afterEach(() => {
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
});
