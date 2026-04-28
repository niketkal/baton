import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runFailover, runIngest } from '../../src/commands/index.js';
import { resetLoggerCacheForTests } from '../../src/output/logger.js';

const TRANSCRIPT_FIXTURE = `## User
We're trying to stabilize the flaky login test. Repro from CI is in failing-test.log.

## Assistant
I'll investigate the test in tests/login.spec.ts and propose a fix that doesn't weaken assertions.

## User
Sounds good — please hand off to the next agent with full context when ready.
`;

const isCi = process.env.CI === 'true' || process.env.CI === '1';
const FAILOVER_BUDGET_MS = isCi ? 15_000 : 5_000;

describe('e2e: failover (week-1 demo gate)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-e2e-'));
    resetLoggerCacheForTests();
  });
  afterEach(() => {
    resetLoggerCacheForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('ingests a transcript and renders BATON.md via failover', async () => {
    const transcriptPath = join(dir, 'transcript.md');
    writeFileSync(transcriptPath, TRANSCRIPT_FIXTURE, 'utf8');

    const ingestCode = await runIngest('transcript', transcriptPath, {
      repo: dir,
      packet: 'demo',
    });
    expect(ingestCode).toBe(0);

    const start = Date.now();
    const failoverCode = await runFailover({
      from: 'claude-code',
      to: 'claude-code',
      packet: 'demo',
      out: 'BATON.md',
      repo: dir,
    });
    const elapsed = Date.now() - start;

    expect(failoverCode).toBe(0);
    const outPath = join(dir, 'BATON.md');
    expect(existsSync(outPath)).toBe(true);
    const content = readFileSync(outPath, 'utf8');
    expect(content).toMatch(/Baton Handoff/);
    expect(content).toMatch(/Next action/);

    // Performance budget: fast warm path. CI relaxes the budget; locally
    // it must beat the < 5s invariant from CLAUDE.md.
    expect(elapsed).toBeLessThan(FAILOVER_BUDGET_MS);
  });
});
