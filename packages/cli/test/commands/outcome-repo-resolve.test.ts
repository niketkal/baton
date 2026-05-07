import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOutcomeIngest } from '../../src/commands/outcome.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('outcome ingest — relative paths resolve against --repo, not process.cwd()', () => {
  let repoA: string;
  let repoB: string;
  let originalCwd: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrText: string;

  beforeEach(() => {
    repoA = mkdtempSync(join(tmpdir(), 'baton-outcome-repoA-'));
    repoB = mkdtempSync(join(tmpdir(), 'baton-outcome-repoB-'));
    writeFileSync(join(repoA, 'result.md'), 'tests pass — from-repoA\n', 'utf8');
    writeFileSync(join(repoB, 'result.md'), 'tests pass — from-repoB\n', 'utf8');
    // Seed a real packet under repoB so outcome ingest accepts the id.
    mkdirSync(join(repoB, '.baton', 'packets', 'pkt'), { recursive: true });
    writeFileSync(
      join(repoB, '.baton', 'packets', 'pkt', 'packet.json'),
      JSON.stringify({ id: 'pkt' }),
    );
    originalCwd = process.cwd();
    process.chdir(repoA);
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrText = '';
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation((s: unknown) => {
      stderrText += typeof s === 'string' ? s : (s as Buffer).toString('utf8');
      return true;
    });
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    process.chdir(originalCwd);
    rmSync(repoA, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    rmSync(repoB, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('reads result.md from --repo, not from cwd', async () => {
    // cwd=repoA but --repo=repoB. Pre-fix this would have read
    // repoA/result.md and stored repoA's outcome content in repoB's
    // packet, an automation-grade footgun.
    const code = await runOutcomeIngest('result.md', {
      packet: 'pkt',
      source: 'ci',
      repo: repoB,
    });
    if (code !== 0) {
      throw new Error(`expected exit 0; got ${code}. stderr was: ${stderrText}`);
    }
    expect(code).toBe(0);

    const outcomesDir = join(repoB, '.baton', 'packets', 'pkt', 'outcomes');
    expect(existsSync(outcomesDir)).toBe(true);
    const outcomeFile = readdirSync(outcomesDir)[0];
    expect(outcomeFile).toBeDefined();
    const stored = JSON.parse(readFileSync(join(outcomesDir, outcomeFile as string), 'utf8')) as {
      body: string;
    };
    expect(stored.body).toContain('from-repoB');
    expect(stored.body).not.toContain('from-repoA');
  });
});
