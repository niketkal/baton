import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runIngest } from '../../src/commands/ingest.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('ingest — relative paths resolve against --repo, not process.cwd()', () => {
  let repoA: string;
  let repoB: string;
  let originalCwd: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repoA = mkdtempSync(join(tmpdir(), 'baton-ingest-repoA-'));
    repoB = mkdtempSync(join(tmpdir(), 'baton-ingest-repoB-'));
    // Distinct content per repo so we can prove which one was read.
    writeFileSync(join(repoA, 'transcript.md'), '## user\nfrom-repoA\n', 'utf8');
    writeFileSync(join(repoB, 'transcript.md'), '## user\nfrom-repoB\n', 'utf8');
    originalCwd = process.cwd();
    process.chdir(repoA);
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    process.chdir(originalCwd);
    rmSync(repoA, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    rmSync(repoB, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('reads transcript.md from --repo, not from cwd', async () => {
    // We're cwd=repoA, but ask for --repo=repoB with relative path.
    // Pre-fix this would have read repoA/transcript.md and ingested
    // the wrong content into repoB's .baton.
    const code = await runIngest('transcript', 'transcript.md', {
      packet: 'p',
      repo: repoB,
    });
    expect(code).toBe(0);

    // Find the ingested artifact under repoB and verify its content
    // matches repoB/transcript.md, not repoA/transcript.md.
    const artifactsDir = join(repoB, '.baton', 'artifacts');
    expect(existsSync(artifactsDir)).toBe(true);
    const subdir = readdirSync(artifactsDir)[0];
    expect(subdir).toBeDefined();
    const stored = readdirSync(join(artifactsDir, subdir as string)).find(
      (f) => f === 'transcript.md',
    );
    expect(stored).toBe('transcript.md');
    const { readFileSync } = await import('node:fs');
    const ingested = readFileSync(join(artifactsDir, subdir as string, stored as string), 'utf8');
    expect(ingested).toContain('from-repoB');
    expect(ingested).not.toContain('from-repoA');
  });
});
