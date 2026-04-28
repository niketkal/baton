import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCompile, runIngest } from '../../src/commands/index.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

const TRANSCRIPT_FIXTURE = '## User\nplz fix\n\n## Assistant\nok.\n';
const LOG_FIXTURE = 'INFO foo\nERROR bar\n';

describe('compile (Fix 3: warnings in human stderr)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-compile-warn-'));
    resetLoggerCacheForTests();
  });
  afterEach(async () => {
    // Close pino's file handle before rmSync; on Windows an open handle
    // blocks `rmdir` of the parent `.baton/logs` directory (`ENOTEMPTY`).
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('writes each compile warning code to stderr in human mode', async () => {
    // Ingest a transcript (parser exists) plus a `log` (no parser) so
    // the compile pipeline emits COMPILE_UNSUPPORTED_ARTIFACT for the log.
    const transcriptPath = join(dir, 't.md');
    writeFileSync(transcriptPath, TRANSCRIPT_FIXTURE, 'utf8');
    const logPath = join(dir, 'l.log');
    writeFileSync(logPath, LOG_FIXTURE, 'utf8');

    expect(await runIngest('transcript', transcriptPath, { repo: dir, packet: 'p' })).toBe(0);
    expect(await runIngest('log', logPath, { repo: dir, packet: 'p' })).toBe(0);

    const stderrCalls: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      stderrCalls.push(String(c));
      return true;
    });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runCompile({ packet: 'p', mode: 'fast', repo: dir });
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();

    // Exit code may be 0 (warnings only) or 2 (warnings + schema invalid).
    // Either is fine; what we're testing is that the warning code reached stderr.
    expect([0, 2]).toContain(code);
    const stderrText = stderrCalls.join('');
    // Each warning code must appear (not just the count).
    expect(stderrText).toMatch(/COMPILE_UNSUPPORTED_ARTIFACT/);
    expect(stderrText).toMatch(/\[warn\]/);
  });
});
