import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * End-to-end shim path test.
 *
 * Spawns the built `baton` CLI bin against `internal codex-wrap`, with a
 * mock `codex` shadowed onto PATH. This proves the actual subcommand is
 * registered and that the wrapper-launcher path works without going
 * through any in-process unit-test plumbing — i.e., what `baton-codex`
 * itself execs at runtime.
 *
 * Cross-platform: on POSIX the mock codex is a bash script + chmod 0755.
 * On Windows it's a `.cmd` batch file (extension-based execution; no
 * chmod needed). The test body is otherwise identical.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CLI_BIN = resolve(REPO_ROOT, 'packages', 'cli', 'dist', 'bin.js');
const IS_WIN = process.platform === 'win32';
const PATH_SEP = IS_WIN ? ';' : ':';

interface MockCodexOpts {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Write a mock `codex` binary into `dir` and return its path. The mock
 * echoes a recognizable line then exits with `opts.exitCode`. On POSIX
 * we ship a bash script; on Windows a `.cmd` batch file. Both honour
 * the same shape of args (`%*` / `$*`) so the assertion that args are
 * forwarded works on either platform.
 */
function writeMockCodex(dir: string, opts: MockCodexOpts): string {
  if (IS_WIN) {
    const path = join(dir, 'codex.cmd');
    const lines = ['@echo off'];
    if (opts.stdout) lines.push(`echo ${opts.stdout}`);
    if (opts.stderr) lines.push(`echo ${opts.stderr} 1>&2`);
    lines.push(`exit /b ${opts.exitCode}`);
    writeFileSync(path, `${lines.join('\r\n')}\r\n`, 'utf8');
    return path;
  }
  const path = join(dir, 'codex');
  const lines = ['#!/usr/bin/env bash'];
  if (opts.stdout) lines.push(`echo "${opts.stdout}"`);
  if (opts.stderr) lines.push(`echo "${opts.stderr}" >&2`);
  lines.push(`exit ${opts.exitCode}`);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

describe('codex shim end-to-end via built CLI', () => {
  let workdir: string;

  beforeAll(() => {
    if (!existsSync(CLI_BIN)) {
      throw new Error(`expected built bin at ${CLI_BIN}; run pnpm --filter @baton/cli build`);
    }
  });

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'baton-codex-shim-'));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('routes through internal codex-wrap and forwards to a mock codex', () => {
    const mockPath = writeMockCodex(workdir, {
      exitCode: 0,
      stdout: IS_WIN ? 'MOCK CODEX OK args=%*' : 'MOCK CODEX OK args=$*',
    });

    const childPath = `${workdir}${PATH_SEP}${process.env.PATH ?? ''}`;
    const result = spawnSync(
      process.execPath,
      [CLI_BIN, 'internal', 'codex-wrap', '--flag', 'value'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          // Prepend the mock dir so our `codex` shadows any real one.
          PATH: childPath,
          // Ensure detect doesn't latch onto a non-existent override.
          BATON_CODEX_BIN: '',
        },
      },
    );

    // Diagnostic block — keep until Windows is stable, then can be removed.
    process.stderr.write('\n[shim e2e diagnostic test1]\n');
    process.stderr.write(`  cwd: ${process.cwd()}\n`);
    process.stderr.write(`  workdir: ${workdir}\n`);
    process.stderr.write(`  mockPath: ${mockPath}\n`);
    process.stderr.write(`  mockExists: ${existsSync(mockPath)}\n`);
    process.stderr.write(`  workdir contents: ${readdirSync(workdir).join(', ')}\n`);
    process.stderr.write(
      `  mock content:\n---\n${readFileSync(mockPath, 'utf8')}\n---\n`,
    );
    process.stderr.write(`  CLI_BIN: ${CLI_BIN}\n`);
    process.stderr.write(`  CLI_BIN exists: ${existsSync(CLI_BIN)}\n`);
    process.stderr.write(`  PATH (first 400 chars): ${childPath.slice(0, 400)}\n`);
    process.stderr.write(`  status: ${result.status}\n`);
    process.stderr.write(`  signal: ${result.signal}\n`);
    process.stderr.write(`  error: ${result.error?.message}\n`);
    process.stderr.write(`  stdout: ${(result.stdout ?? '').slice(0, 1500)}\n`);
    process.stderr.write(`  stderr: ${(result.stderr ?? '').slice(0, 1500)}\n`);
    process.stderr.write('[end shim e2e diagnostic test1]\n');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MOCK CODEX OK');
    expect(result.stdout).toContain('--flag');
    expect(result.stdout).toContain('value');
  });

  it('returns codex exit code when mock codex fails', () => {
    const mockPath = writeMockCodex(workdir, {
      exitCode: 7,
      stderr: 'boom',
    });

    const childPath = `${workdir}${PATH_SEP}${process.env.PATH ?? ''}`;
    const result = spawnSync(process.execPath, [CLI_BIN, 'internal', 'codex-wrap'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: childPath,
        BATON_CODEX_BIN: '',
      },
    });

    // Diagnostic block — keep until Windows is stable, then can be removed.
    process.stderr.write('\n[shim e2e diagnostic test2]\n');
    process.stderr.write(`  workdir: ${workdir}\n`);
    process.stderr.write(`  mockPath: ${mockPath}\n`);
    process.stderr.write(`  mockExists: ${existsSync(mockPath)}\n`);
    process.stderr.write(`  workdir contents: ${readdirSync(workdir).join(', ')}\n`);
    process.stderr.write(
      `  mock content:\n---\n${readFileSync(mockPath, 'utf8')}\n---\n`,
    );
    process.stderr.write(`  PATH (first 400 chars): ${childPath.slice(0, 400)}\n`);
    process.stderr.write(`  status: ${result.status}\n`);
    process.stderr.write(`  signal: ${result.signal}\n`);
    process.stderr.write(`  error: ${result.error?.message}\n`);
    process.stderr.write(`  stdout: ${(result.stdout ?? '').slice(0, 1500)}\n`);
    process.stderr.write(`  stderr: ${(result.stderr ?? '').slice(0, 1500)}\n`);
    process.stderr.write('[end shim e2e diagnostic test2]\n');

    expect(result.status).toBe(7);
  });
});
