import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHistory } from '../../src/commands/history.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

/**
 * `baton history --packet <id>` joins the user-supplied id into
 * `.baton/history/packets/<id>` and enumerates `v*.json`. A traversal
 * value like `../../somewhere` would let the command enumerate +
 * parse arbitrary JSON files outside the canonical history tree
 * (read-side info disclosure). validatePacketId at the boundary
 * (added in the v1.0.1 fixes) closes that.
 *
 * This test is the regression guard.
 */
describe('history command — packet id traversal hardening', () => {
  let dir: string;
  let outsideDir: string;
  let outsideTarget: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrOutput: string;
  let stdoutOutput: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-history-trav-'));
    // Lay down a `v1.json` that is OUTSIDE .baton/history/packets/.
    // If validation regresses, a traversal value like `../../leak`
    // would resolve to this directory and the runner would parse +
    // surface its contents in the history report.
    outsideDir = join(dir, 'leak');
    mkdirSync(outsideDir, { recursive: true });
    outsideTarget = join(outsideDir, 'v1.json');
    writeFileSync(
      outsideTarget,
      JSON.stringify({ status: 'leaked', updated_at: '2026-01-01T00:00:00.000Z' }),
      'utf8',
    );
    resetLoggerCacheForTests();
    stderrOutput = '';
    stdoutOutput = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation((s: unknown) => {
      stdoutOutput += typeof s === 'string' ? s : (s as Buffer).toString('utf8');
      return true;
    });
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
    ['parent traversal', '../../leak'],
    ['absolute path', '/etc/passwd'],
    ['whitespace', 'has space'],
    ['newline injection', 'has\nnewline'],
    ['leading dash', '-leading'],
  ])('rejects %s and does not enumerate out-of-tree files', async (_label, packetId) => {
    const before = readFileSync(outsideTarget, 'utf8');
    const code = await runHistory({ packet: packetId, repo: dir, json: true });
    expect(code).not.toBe(0);
    expect(stderrOutput).toMatch(/invalid packet id/);
    // The "leak" entry must not appear in any output stream.
    expect(stdoutOutput).not.toMatch(/leaked/);
    expect(stderrOutput).not.toMatch(/leaked/);
    // And the file we set up must be untouched.
    expect(readFileSync(outsideTarget, 'utf8')).toBe(before);
  });

  it('still allows valid packet ids through (validation passes, returns empty history)', async () => {
    const code = await runHistory({ packet: 'valid-id', repo: dir, json: true });
    expect(code).toBe(0);
    expect(stderrOutput).not.toMatch(/invalid packet id/);
    // No history dir for `valid-id`, so summary should reflect zero events.
    const parsed = JSON.parse(stdoutOutput) as {
      packetId: string;
      summary: { versionCount: number; dispatchCount: number; outcomeCount: number };
    };
    expect(parsed.packetId).toBe('valid-id');
    expect(parsed.summary.versionCount).toBe(0);
    expect(parsed.summary.dispatchCount).toBe(0);
    expect(parsed.summary.outcomeCount).toBe(0);
    // Sanity: the traversal sentinel still exists untouched.
    expect(existsSync(outsideTarget)).toBe(true);
  });
});
