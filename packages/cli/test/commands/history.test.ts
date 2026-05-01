import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHistoryReport, runHistory } from '../../src/commands/history.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

interface CapturedJson {
  packetId: string;
  events: Array<{ kind: string; at: string; data: Record<string, unknown> }>;
  summary: { versionCount: number; dispatchCount: number; outcomeCount: number };
}

describe('history', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-history-'));
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

  it('returns empty timeline when no history or events exist', async () => {
    const report = await buildHistoryReport({ packet: 'flaky-test-fix', repo: dir });
    expect(report.events).toEqual([]);
    expect(report.summary).toEqual({ versionCount: 0, dispatchCount: 0, outcomeCount: 0 });
  });

  it('sorts versions, dispatches, and outcomes chronologically', async () => {
    const versionsDir = join(dir, '.baton', 'history', 'packets', 'flaky-test-fix');
    mkdirSync(versionsDir, { recursive: true });
    writeFileSync(
      join(versionsDir, 'v1.json'),
      JSON.stringify({
        status: 'draft',
        validation_level: 'draft',
        updated_at: '2026-04-20T00:00:00.000Z',
      }),
      'utf8',
    );
    writeFileSync(
      join(versionsDir, 'v2.json'),
      JSON.stringify({
        status: 'ready_for_export',
        validation_level: 'ready',
        updated_at: '2026-04-21T00:00:00.000Z',
      }),
      'utf8',
    );

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
        destination: '/tmp/x.md',
        created_at: '2026-04-22T00:00:00.000Z',
      })}\n`,
      'utf8',
    );
    // unrelated packet, must not appear
    appendFileSync(
      join(eventsDir, 'dispatch.jsonl'),
      `${JSON.stringify({
        id: 'rcpt-other',
        packet_id: 'someone-else',
        target_tool: 'codex',
        adapter: 'file',
        status: 'ok',
        created_at: '2026-04-22T01:00:00.000Z',
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
        created_at: '2026-04-23T00:00:00.000Z',
      })}\n`,
      'utf8',
    );

    const report = await buildHistoryReport({ packet: 'flaky-test-fix', repo: dir });
    expect(report.summary).toEqual({ versionCount: 2, dispatchCount: 1, outcomeCount: 1 });
    expect(report.events.map((e) => e.kind)).toEqual(['version', 'version', 'dispatch', 'outcome']);
    expect(report.events.map((e) => e.at)).toEqual([
      '2026-04-20T00:00:00.000Z',
      '2026-04-21T00:00:00.000Z',
      '2026-04-22T00:00:00.000Z',
      '2026-04-23T00:00:00.000Z',
    ]);
  });

  it('emits JSON when --json is set', async () => {
    const code = await runHistory({ packet: 'flaky-test-fix', repo: dir, json: true });
    expect(code).toBe(0);
    const written = stdout.mock.calls.map((c) => c[0] as string).join('');
    const parsed = JSON.parse(written) as CapturedJson;
    expect(parsed.packetId).toBe('flaky-test-fix');
    expect(parsed.events).toEqual([]);
  });

  it('rejects when --packet is missing', async () => {
    const code = await runHistory({ packet: '', repo: dir });
    expect(code).toBe(1);
    const errs = stderr.mock.calls.map((c) => c[0] as string).join('');
    expect(errs).toMatch(/--packet/);
  });

  it('skips malformed JSONL lines without crashing', async () => {
    const eventsDir = join(dir, '.baton', 'events');
    mkdirSync(eventsDir, { recursive: true });
    appendFileSync(
      join(eventsDir, 'dispatch.jsonl'),
      `not-json-here\n${JSON.stringify({
        id: 'r',
        packet_id: 'p1',
        target_tool: 'codex',
        adapter: 'file',
        status: 'ok',
        created_at: '2026-04-22T00:00:00.000Z',
      })}\n`,
      'utf8',
    );
    const report = await buildHistoryReport({ packet: 'p1', repo: dir });
    expect(report.summary.dispatchCount).toBe(1);
  });
});
