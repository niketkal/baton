import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOutcomeIngest } from '../../src/commands/outcome.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('outcome ingest — packet id traversal hardening', () => {
  let dir: string;
  let outsideTarget: string;
  let resultSrc: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrOutput: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-outcome-trav-'));
    outsideTarget = join(dir, 'sentinel.json');
    writeFileSync(outsideTarget, '{"original":true}\n', 'utf8');
    resultSrc = join(dir, 'result.txt');
    writeFileSync(resultSrc, 'tests pass', 'utf8');
    resetLoggerCacheForTests();
    stderrOutput = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation((s: unknown) => {
      stderrOutput += typeof s === 'string' ? s : (s as Buffer).toString('utf8');
      return true;
    });
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it.each([
    ['parent traversal', '../../sentinel'],
    ['absolute path', '/etc/passwd'],
    ['whitespace', 'has space'],
    ['newline injection', 'has\nnewline'],
    ['empty', ''],
    ['leading dash', '-leading'],
  ])('rejects %s and writes nothing outside .baton/packets/', async (_label, packetId) => {
    const before = readFileSync(outsideTarget, 'utf8');
    const code = await runOutcomeIngest(resultSrc, {
      packet: packetId,
      source: 'claude-code',
      repo: dir,
    });
    expect(code).not.toBe(0);
    expect(stderrOutput).toMatch(/invalid packet id/);
    expect(readFileSync(outsideTarget, 'utf8')).toBe(before);
    // Verify no .baton/packets/<id>/outcomes/ was created anywhere outside
    // the canonical layout. The simplest assertion is that .baton itself
    // doesn't exist yet (validation happened before any mkdir).
    expect(existsSync(join(dir, '.baton'))).toBe(false);
  });
});
