import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @batonai/lint to inject a synthetic critical finding. We can't
// trigger BTN060 from artifact content alone (BTN060 scans narrative
// fields, not raw transcripts), and we don't want a brittle test that
// hand-builds a packet that violates BTN001-004. Mocking gives us a
// stable lint-error-but-schema-valid combination, which is exactly the
// case Fix 1 was added to block.
vi.mock('@batonai/lint', async () => {
  const actual = await vi.importActual<typeof import('@batonai/lint')>('@batonai/lint');
  return {
    ...actual,
    lint: ((packet: { id?: string }) => ({
      packetId: packet.id ?? 'unknown',
      status: 'failed' as const,
      errors: [
        {
          code: 'BTN999_TEST',
          severity: 'critical' as const,
          message: 'synthetic lint error for Fix 1 regression',
        },
      ],
      warnings: [],
      summary: { blockingCount: 1, warningCount: 0 },
    })) as unknown as typeof actual.lint,
  };
});

import { runFailover, runIngest } from '../../src/commands/index.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

const TRANSCRIPT_FIXTURE = '## User\nrepro flaky test\n\n## Assistant\non it.\n';

describe('failover (Fix 1: lint OR schema-invalid blocks)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-failover-gate-'));
    resetLoggerCacheForTests();
  });
  afterEach(async () => {
    // Close pino's file handle before rmSync; on Windows an open handle
    // blocks `rmdir` of the parent `.baton/logs` directory (`ENOTEMPTY`).
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('exits 2 and skips BATON.md when lint errors but schema validates', async () => {
    const transcriptPath = join(dir, 't.md');
    writeFileSync(transcriptPath, TRANSCRIPT_FIXTURE, 'utf8');
    expect(await runIngest('transcript', transcriptPath, { repo: dir, packet: 'p' })).toBe(0);

    const stderrCalls: string[] = [];
    const stdoutCalls: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      stderrCalls.push(String(c));
      return true;
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      stdoutCalls.push(String(c));
      return true;
    });
    const code = await runFailover({
      from: 'claude-code',
      to: 'claude-code',
      packet: 'p',
      out: 'BATON.md',
      repo: dir,
    });
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();

    expect(code).toBe(2);
    expect(existsSync(join(dir, 'BATON.md'))).toBe(false);
    const stderrText = stderrCalls.join('');
    expect(stderrText).toMatch(/failover stopped/);
    expect(stderrText).toMatch(/lint errors/);
  });
});
