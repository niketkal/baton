import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BatonPacket } from '@batonai/schema';
import { PacketStore } from '@batonai/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFailover } from '../../src/commands/failover.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

function makePacketWithBrokenRef(): BatonPacket {
  return {
    schema_version: 'baton.packet/v1',
    id: 'broken-ref',
    title: 'packet with non-existent file ref',
    status: 'draft',
    validation_level: 'draft',
    task_type: 'implementation',
    objective: 'fix something',
    current_state: 'started',
    next_action: 'continue',
    open_questions: [],
    confidence_score: 0.5,
    repo_context: {
      attached: true,
      root: '.',
      vcs: 'git',
      branch: 'main',
      base_branch: 'main',
      commit: '0000000',
      base_commit: '0000000',
      dirty: false,
    },
    context_items: [
      {
        kind: 'file',
        ref: 'does/not/exist.ts',
        reason: 'a file we claim is relevant but does not exist on disk',
        priority: 1,
        freshness_score: 1,
        provenance_refs: [],
      },
    ],
    constraints: [],
    attempts: [],
    acceptance_criteria: [],
    warnings: [],
    provenance_links: [],
    source_artifacts: [],
    created_at: '2026-05-07T00:00:00Z',
    updated_at: '2026-05-07T00:00:00Z',
  };
}

describe('failover — repo-aware lint context (BTN012)', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrText: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-failover-lint-ctx-'));
    // Make it a real git repo so attachRepo() returns a usable fs/gitRefs.
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email test@example.com', { cwd: dir });
    execSync('git config user.name test', { cwd: dir });
    writeFileSync(join(dir, 'README.md'), '# r\n', 'utf8');
    execSync('git add . && git commit -q -m init', { cwd: dir });
    // Seed a packet whose context_items.ref points at a missing file.
    mkdirSync(join(dir, '.baton', 'packets', 'broken-ref'), { recursive: true });
    const store = PacketStore.open(dir);
    try {
      store.create(makePacketWithBrokenRef());
    } finally {
      store.close();
    }
    resetLoggerCacheForTests();
    stderrText = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation((s: unknown) => {
      stderrText += typeof s === 'string' ? s : (s as Buffer).toString('utf8');
      return true;
    });
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('blocks the handoff because BTN012 fires against the missing file ref', async () => {
    // Pre-fix the failover called lint() with only { repoRoot }, so
    // BTN012 silently returned [] (it short-circuits when ctx.fs is
    // absent) and the broken-ref packet would have been rendered and
    // shipped. The fix injects fs/gitRefs/freshness so the rule
    // actually fires.
    const code = await runFailover({
      to: 'codex',
      packet: 'broken-ref',
      repo: dir,
    });
    if (code === 0) {
      // Surface the actual stderr so we can debug if the assertion fails.
      throw new Error(`expected non-zero exit; got 0. stderr was: ${stderrText}`);
    }
    expect(code).not.toBe(0);
    expect(stderrText).toMatch(/lint errors|failover stopped/i);
  });
});
