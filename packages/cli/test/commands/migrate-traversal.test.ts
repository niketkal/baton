import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/index.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('migrate command — packet id traversal hardening', () => {
  let dir: string;
  let outsideTarget: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrOutput: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-migrate-trav-'));
    // A pre-existing JSON file that lives OUTSIDE .baton/packets/. If
    // validation ever regresses, a hostile --packet value could overwrite
    // this. The test asserts the file is byte-identical after the run.
    outsideTarget = join(dir, 'sentinel.json');
    writeFileSync(outsideTarget, '{"original":true}\n', 'utf8');
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
    const code = await main(['node', 'baton', 'migrate', '--packet', packetId, '--repo', dir]);
    expect(code).not.toBe(0);
    expect(stderrOutput).toMatch(/invalid packet id/);
    // sentinel.json must be untouched
    expect(readFileSync(outsideTarget, 'utf8')).toBe(before);
    // No .baton subtree should exist (migrate never reached the FS layer)
    expect(existsSync(join(dir, '.baton'))).toBe(false);
  });

  it('still allows valid packet ids through', async () => {
    // Sanity check: with a valid id but no packet present, migrate returns 1
    // with the "packet not found" message — NOT the "invalid packet id"
    // message — proving validation passed.
    const code = await main(['node', 'baton', 'migrate', '--packet', 'valid-id', '--repo', dir]);
    expect(code).toBe(1);
    expect(stderrOutput).toMatch(/packet not found/);
    expect(stderrOutput).not.toMatch(/invalid packet id/);
  });
});
