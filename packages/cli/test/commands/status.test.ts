import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BatonPacket } from '@batonai/schema';
import { PacketStore } from '@batonai/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStatusReport, runStatus } from '../../src/commands/status.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

function makePacket(id: string, overrides: Partial<BatonPacket> = {}): BatonPacket {
  return {
    schema_version: 'baton.packet/v1',
    id,
    title: `Packet ${id}`,
    status: 'draft',
    validation_level: 'draft',
    task_type: 'generic',
    objective: 'Do the thing.',
    current_state: 'Starting.',
    next_action: 'Continue.',
    open_questions: [],
    confidence_score: 0.5,
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
    created_at: '2026-04-27T00:00:00.000Z',
    updated_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('status', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-status-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('lists all packets when --packet is omitted', async () => {
    const store = PacketStore.open(dir);
    try {
      store.create(makePacket('alpha', { updated_at: '2026-04-27T01:00:00.000Z' }));
      store.create(makePacket('bravo', { updated_at: '2026-04-27T02:00:00.000Z' }));
    } finally {
      store.close();
    }

    const report = await buildStatusReport({ repo: dir });
    expect(report.kind).toBe('list');
    if (report.kind !== 'list') throw new Error('unreachable');
    // Sorted by updated_at desc.
    expect(report.packets.map((p) => p.id)).toEqual(['bravo', 'alpha']);
  });

  it('returns detail view for a single packet with latest dispatch + outcome + warnings', async () => {
    const store = PacketStore.open(dir);
    try {
      store.create(
        makePacket('flaky-test-fix', {
          status: 'ready_for_export',
          validation_level: 'ready',
          warnings: [
            {
              code: 'BTN014',
              severity: 'critical',
              message: 'Packet is stale.',
              blocking: true,
              source: 'lint',
            },
          ],
        }),
      );
    } finally {
      store.close();
    }
    const eventsDir = join(dir, '.baton', 'events');
    mkdirSync(eventsDir, { recursive: true });
    appendFileSync(
      join(eventsDir, 'dispatch.jsonl'),
      `${JSON.stringify({
        id: 'rcpt-1',
        packet_id: 'flaky-test-fix',
        target_tool: 'claude-code',
        adapter: 'file',
        status: 'ok',
        destination: '/tmp/flaky.md',
        created_at: '2026-04-22T00:00:00.000Z',
      })}\n${JSON.stringify({
        id: 'rcpt-2',
        packet_id: 'flaky-test-fix',
        target_tool: 'codex',
        adapter: 'stdout',
        status: 'ok',
        destination: 'stdout',
        created_at: '2026-04-23T00:00:00.000Z',
      })}\n`,
      'utf8',
    );
    appendFileSync(
      join(eventsDir, 'outcomes.jsonl'),
      `${JSON.stringify({
        id: 'oc-1',
        packet_id: 'flaky-test-fix',
        source_tool: 'claude-code',
        classification: 'success',
        outcome_path: '/x',
        created_at: '2026-04-24T00:00:00.000Z',
      })}\n`,
      'utf8',
    );

    const report = await buildStatusReport({ packet: 'flaky-test-fix', repo: dir });
    expect(report.kind).toBe('packet');
    if (report.kind !== 'packet') throw new Error('unreachable');
    expect(report.packet.id).toBe('flaky-test-fix');
    expect(report.packet.status).toBe('ready_for_export');
    expect(report.packet.latestDispatch?.receipt_id).toBe('rcpt-2');
    expect(report.packet.latestDispatch?.target_tool).toBe('codex');
    expect(report.packet.latestOutcome?.classification).toBe('success');
    expect(report.packet.activeWarnings).toHaveLength(1);
    expect(report.packet.activeWarnings[0]?.blocking).toBe(true);
  });

  it('returns exit 1 with stderr message for an unknown packet', async () => {
    // No packets created.
    PacketStore.open(dir).close();
    const code = await runStatus({ packet: 'nope', repo: dir });
    expect(code).toBe(1);
    const errs = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(errs).toMatch(/unknown packet/);
  });

  it('emits JSON list when --json is set', async () => {
    const store = PacketStore.open(dir);
    try {
      store.create(makePacket('alpha'));
    } finally {
      store.close();
    }
    const code = await runStatus({ repo: dir, json: true });
    expect(code).toBe(0);
    const written = stdout.mock.calls.map((c) => c[0] as string).join('');
    const parsed = JSON.parse(written) as { kind: string; packets: Array<{ id: string }> };
    expect(parsed.kind).toBe('list');
    expect(parsed.packets[0]?.id).toBe('alpha');
  });
});
