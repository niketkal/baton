import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CLI_BIN = resolve(REPO_ROOT, 'packages', 'cli', 'dist', 'bin.js');

// The codex wrapper-launcher is POSIX-only per tech spec §8.2 (the shim
// is a bash script). Spawning a mock codex via PATH on Windows would
// require a .cmd/.exe wrapper and significantly different test plumbing.
// The wrapper itself is unit-tested cross-platform; this test only
// validates the bin -> internal codex-wrap path which is exercised the
// same way on POSIX.
describe.skipIf(process.platform === 'win32')('codex shim end-to-end via built CLI', () => {
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
    // Mock codex: print a recognizable line and exit 0.
    const mockCodex = join(workdir, 'codex');
    writeFileSync(
      mockCodex,
      `#!/usr/bin/env bash
echo "MOCK CODEX OK args=$*"
exit 0
`,
      'utf8',
    );
    chmodSync(mockCodex, 0o755);

    const result = spawnSync(
      process.execPath,
      [CLI_BIN, 'internal', 'codex-wrap', '--flag', 'value'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          // Prepend the mock dir so our `codex` shadows any real one.
          PATH: `${workdir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
        },
      },
    );

    expect(result.status).toBe(0);
    // The wrapper forwards codex stdout verbatim to our stdout.
    expect(result.stdout).toContain('MOCK CODEX OK');
    expect(result.stdout).toContain('--flag value');
  });

  it('returns codex exit code when mock codex fails', () => {
    const mockCodex = join(workdir, 'codex');
    writeFileSync(
      mockCodex,
      `#!/usr/bin/env bash
echo "boom" >&2
exit 7
`,
      'utf8',
    );
    chmodSync(mockCodex, 0o755);

    const result = spawnSync(process.execPath, [CLI_BIN, 'internal', 'codex-wrap'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${workdir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
    });

    expect(result.status).toBe(7);
  });
});
