import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BIN, BUDGETS, ensureBuilt } from './_helpers.js';

const TRANSCRIPT_FIXTURE = `## User
We're trying to stabilize the flaky login test. Repro from CI is in failing-test.log.

## Assistant
I'll investigate the test in tests/login.spec.ts and propose a fix that doesn't weaken assertions.

## User
Sounds good — please hand off to the next agent with full context when ready.
`;

describe('performance: baton failover (CLAUDE.md invariant 2: < 5s warm cache)', () => {
  let dir: string;

  beforeAll(() => {
    ensureBuilt();
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-perf-failover-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it.skipIf(process.env.CI === 'true' && process.platform === 'win32')(
    'failover happy-path completes under the 5s budget (warm cache, ingest+compile-fast+lint+render)',
    () => {
      const transcript = join(dir, 'transcript.md');
      writeFileSync(transcript, TRANSCRIPT_FIXTURE, 'utf8');

      // Step 1: ingest a transcript so failover has something to compile.
      const ingest = spawnSync(
        process.execPath,
        [BIN, 'ingest', 'transcript', transcript, '--repo', dir, '--packet', 'demo'],
        { encoding: 'utf8' },
      );
      expect(ingest.status, `ingest stderr: ${ingest.stderr}`).toBe(0);

      // Step 2: measure failover (the budget-bearing operation).
      const start = Date.now();
      const r = spawnSync(
        process.execPath,
        [
          BIN,
          'failover',
          '--from',
          'claude-code',
          '--to',
          'claude-code',
          '--packet',
          'demo',
          '--out',
          join(dir, 'BATON.md'),
          '--repo',
          dir,
        ],
        { encoding: 'utf8' },
      );
      const elapsed = Date.now() - start;
      expect(r.status, `failover stderr: ${r.stderr}`).toBe(0);
      expect(elapsed).toBeLessThan(BUDGETS.failover);
    },
  );
});
