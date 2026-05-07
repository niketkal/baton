import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BatonPacket } from '@batonai/schema';
import { PacketStore } from '@batonai/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFailover } from '../../src/commands/failover.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

function makePacket(args: {
  ref: string;
  commit: string;
  baseCommit: string;
}): BatonPacket {
  return {
    schema_version: 'baton.packet/v1',
    id: 'pkt',
    title: 'failover lint context regression fixture',
    status: 'draft',
    validation_level: 'draft',
    // Use 'generic' so BTN020 (implementation needs acceptance_criteria)
    // doesn't fire — keeps the test isolated to the BTN012 signal.
    task_type: 'generic',
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
      // Real, resolvable refs so BTN013 stays quiet — the only
      // variable across the two tests below is whether the
      // context_item ref exists on disk, which is what BTN012 checks.
      commit: args.commit,
      base_commit: args.baseCommit,
      dirty: false,
    },
    context_items: [
      {
        kind: 'file',
        ref: args.ref,
        reason: 'a file we claim is relevant',
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
  let commit: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrText: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-failover-lint-ctx-'));
    // Real git repo with a real HEAD so attachRepo() returns
    // usable fs/gitRefs and BTN013 sees a resolvable commit ref.
    execSync('git init -q -b main', { cwd: dir });
    execSync('git config user.email test@example.com', { cwd: dir });
    execSync('git config user.name test', { cwd: dir });
    writeFileSync(join(dir, 'README.md'), '# r\n', 'utf8');
    // Seed a real source file the "good" test will reference; the
    // "bad" test points at a missing path instead.
    writeFileSync(join(dir, 'src.ts'), 'export const x = 1\n', 'utf8');
    execSync('git add . && git commit -q -m init', { cwd: dir });
    commit = execSync('git rev-parse HEAD', { cwd: dir }).toString('utf8').trim();
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

  function seedPacket(packet: BatonPacket): void {
    mkdirSync(join(dir, '.baton', 'packets', packet.id), { recursive: true });
    const store = PacketStore.open(dir);
    try {
      store.create(packet);
    } finally {
      store.close();
    }
  }

  it('passes failover when refs and files are real (control — proves lint context works)', async () => {
    // Same fixture shape as the bad case; only difference is the
    // context_item.ref points at a file that exists. With the new
    // repo-aware lint context this must NOT block — proving the
    // failure in the next test is BTN012-specific, not noise from
    // BTN013/014 firing on the same fixture.
    seedPacket(makePacket({ ref: 'src.ts', commit, baseCommit: commit }));
    const code = await runFailover({ to: 'codex', packet: 'pkt', repo: dir });
    if (code !== 0) {
      throw new Error(`control case unexpectedly blocked. stderr: ${stderrText}`);
    }
    expect(code).toBe(0);
  });

  it('blocks failover specifically because BTN012 fires on the missing file ref', async () => {
    // Pre-fix the failover called lint() with only { repoRoot }, so
    // BTN012 silently returned [] (it short-circuits when ctx.fs is
    // absent) and the broken-ref packet was rendered and shipped.
    // The fix injects fs/gitRefs/freshness so the rule actually
    // fires. The control case above guarantees BTN013/014 don't
    // taint this signal.
    seedPacket(makePacket({ ref: 'does/not/exist.ts', commit, baseCommit: commit }));
    const code = await runFailover({ to: 'codex', packet: 'pkt', repo: dir });
    expect(code).not.toBe(0);
    expect(stderrText).toMatch(/lint errors|failover stopped/i);
  });
});
