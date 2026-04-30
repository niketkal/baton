import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BatonPacket } from '@batonai/schema';
import { PacketStore } from '@batonai/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDispatch } from '../../src/commands/dispatch.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

function makePacket(): BatonPacket {
  return {
    schema_version: 'baton.packet/v1',
    id: 'flaky-test-fix',
    title: 'Flaky test fix',
    status: 'draft',
    validation_level: 'draft',
    task_type: 'implementation',
    objective: 'Stabilize the flaky test.',
    current_state: 'Reproduced locally.',
    next_action: 'Add retry guard.',
    open_questions: [],
    confidence_score: 0.7,
    repo_context: {
      attached: true,
      root: '/repo',
      vcs: 'git',
      branch: 'main',
      base_branch: 'main',
      commit: 'abc1234',
      base_commit: 'def5678',
      dirty: false,
    },
    context_items: [],
    constraints: [],
    attempts: [],
    acceptance_criteria: [],
    warnings: [],
    provenance_links: [],
    source_artifacts: [],
    created_at: '2026-04-27T00:00:00Z',
    updated_at: '2026-04-27T00:00:00Z',
  };
}

describe('dispatch', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-dispatch-'));
    resetLoggerCacheForTests();
    const store = PacketStore.open(dir);
    try {
      store.create(makePacket());
    } finally {
      store.close();
    }
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('dispatches via the file adapter and writes a dispatch_events row', async () => {
    const out = join(dir, 'out.md');
    const code = await runDispatch({
      packet: 'flaky-test-fix',
      target: 'generic',
      adapter: 'file',
      out,
      repo: dir,
    });
    expect(code).toBe(0);

    expect(existsSync(out)).toBe(true);
    const md = readFileSync(out, 'utf8');
    expect(md).toContain('Flaky test fix');

    const eventsLog = join(dir, '.baton', 'events', 'dispatch.jsonl');
    expect(existsSync(eventsLog)).toBe(true);
    const event = JSON.parse(readFileSync(eventsLog, 'utf8').trim()) as {
      packet_id: string;
      target_tool: string;
      adapter: string;
      status: string;
      destination: string;
    };
    expect(event.packet_id).toBe('flaky-test-fix');
    expect(event.target_tool).toBe('generic');
    expect(event.adapter).toBe('file');
    expect(event.status).toBe('ok');
    expect(event.destination).toBe(out);
  });

  it('dispatches via the stdout adapter (no file written)', async () => {
    const code = await runDispatch({
      packet: 'flaky-test-fix',
      target: 'codex',
      adapter: 'stdout',
      repo: dir,
    });
    expect(code).toBe(0);
    // Markdown was emitted on stdout.
    const written = stdout.mock.calls.map((c) => c[0] as string).join('');
    expect(written).toContain('Flaky test fix');
  });

  it('rejects an unknown target', async () => {
    const code = await runDispatch({
      packet: 'flaky-test-fix',
      target: 'unknown' as never,
      adapter: 'file',
      repo: dir,
    });
    expect(code).toBe(1);
  });

  it('rejects an unknown adapter', async () => {
    const code = await runDispatch({
      packet: 'flaky-test-fix',
      target: 'generic',
      adapter: 'github-comment' as never,
      repo: dir,
    });
    expect(code).toBe(1);
  });
});
